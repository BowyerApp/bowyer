/**
 * Uniswap v2 execution layer for Robinhood Chain — no router, no aggregator.
 *
 * Swaps go directly against the pair contract: transfer tokenIn to the pair,
 * then call swap() for a pre-computed output. Requesting the pre-computed
 * output makes the constant-product check itself the slippage guard: if
 * reserves move against us beyond tolerance between quote and execution, the
 * pair reverts with K and no trade happens.
 *
 * The surface area is deliberately tiny: ERC-20 transfer, pair.swap, and
 * plain transfers back to the owner. Agent keys never sign anything else.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  type PrivateKeyAccount,
} from "viem";
import { ACTIVE_CHAIN, rpcUrl } from "@/lib/chain";

export const V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f" as const;
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as const;
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as const;
export const USDG_DEC = 6;
export const WETH_DEC = 18;

/** Reject execution when the quote moves more than this against us. */
const SLIPPAGE_BPS = BigInt(150); // 1.5%

const chain = {
  id: ACTIVE_CHAIN.chainIdDecimal,
  name: ACTIVE_CHAIN.chainName,
  nativeCurrency: ACTIVE_CHAIN.nativeCurrency,
  rpcUrls: { default: { http: [...ACTIVE_CHAIN.rpcUrls] } },
} as const;

const ERC20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const PAIR = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes data)",
]);

const FACTORY = parseAbi(["function getPair(address, address) view returns (address)"]);

export function publicClient() {
  return createPublicClient({ chain, transport: http(rpcUrl()) });
}

function walletClient(account: PrivateKeyAccount) {
  return createWalletClient({ account, chain, transport: http(rpcUrl()) });
}

/* ---------------- pair discovery + quotes ---------------- */

const pairCache = new Map<string, { pair: string; token0: string; token1: string } | null>();

export async function findV2Pair(tokenA: string, tokenB: string) {
  const key = [tokenA.toLowerCase(), tokenB.toLowerCase()].sort().join(":");
  if (pairCache.has(key)) return pairCache.get(key) ?? null;
  const client = publicClient();
  const pair = (await client.readContract({
    address: V2_FACTORY,
    abi: FACTORY,
    functionName: "getPair",
    args: [tokenA as `0x${string}`, tokenB as `0x${string}`],
  })) as string;
  if (!pair || pair === "0x0000000000000000000000000000000000000000") {
    pairCache.set(key, null);
    return null;
  }
  const [token0, token1] = await Promise.all([
    client.readContract({ address: pair as `0x${string}`, abi: PAIR, functionName: "token0" }),
    client.readContract({ address: pair as `0x${string}`, abi: PAIR, functionName: "token1" }),
  ]);
  const info = {
    pair: pair.toLowerCase(),
    token0: (token0 as string).toLowerCase(),
    token1: (token1 as string).toLowerCase(),
  };
  pairCache.set(key, info);
  return info;
}

export async function pairReserves(pair: string): Promise<{ r0: bigint; r1: bigint }> {
  const [r0, r1] = (await publicClient().readContract({
    address: pair as `0x${string}`,
    abi: PAIR,
    functionName: "getReserves",
  })) as unknown as [bigint, bigint, number];
  return { r0, r1 };
}

/** Constant-product output after the 0.3% LP fee. */
export function v2AmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  const inWithFee = amountIn * BigInt(997);
  return (inWithFee * reserveOut) / (reserveIn * BigInt(1000) + inWithFee);
}

const decimalsCache = new Map<string, number>();
export async function tokenDecimals(token: string): Promise<number> {
  const key = token.toLowerCase();
  if (key === USDG) return USDG_DEC;
  if (key === WETH) return WETH_DEC;
  const hit = decimalsCache.get(key);
  if (hit !== undefined) return hit;
  const dec = Number(
    await publicClient().readContract({
      address: token as `0x${string}`,
      abi: ERC20,
      functionName: "decimals",
    })
  );
  decimalsCache.set(key, dec);
  return dec;
}

export async function erc20Balance(token: string, owner: string): Promise<bigint> {
  return (await publicClient().readContract({
    address: token as `0x${string}`,
    abi: ERC20,
    functionName: "balanceOf",
    args: [owner as `0x${string}`],
  })) as bigint;
}

export async function nativeBalance(owner: string): Promise<bigint> {
  return publicClient().getBalance({ address: owner as `0x${string}` });
}

/** Spot ETH/USD from the canonical WETH/USDG pool. */
export async function ethUsdSpot(): Promise<number> {
  const info = await findV2Pair(WETH, USDG);
  if (!info) return 0;
  const { r0, r1 } = await pairReserves(info.pair);
  const [wethR, usdgR] = info.token0 === WETH ? [r0, r1] : [r1, r0];
  if (wethR === BigInt(0)) return 0;
  return Number(usdgR) / 1e6 / (Number(wethR) / 1e18);
}

/* ---------------- execution ---------------- */

export interface SwapResult {
  txHash: string;
  amountIn: bigint;
  amountOut: bigint;
}

/**
 * Swap exact tokenIn -> tokenOut against their v2 pair.
 * Throws if no pair, thin reserves, or slippage beyond tolerance.
 */
export async function swapV2Exact(input: {
  account: PrivateKeyAccount;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
}): Promise<SwapResult> {
  const { account, tokenIn, tokenOut, amountIn } = input;
  const info = await findV2Pair(tokenIn, tokenOut);
  if (!info) throw new Error(`no v2 pair for ${tokenIn}/${tokenOut}`);

  const { r0, r1 } = await pairReserves(info.pair);
  const inIs0 = info.token0 === tokenIn.toLowerCase();
  const [reserveIn, reserveOut] = inIs0 ? [r0, r1] : [r1, r0];
  if (reserveIn === BigInt(0) || reserveOut === BigInt(0)) throw new Error("empty reserves");

  const quoted = v2AmountOut(amountIn, reserveIn, reserveOut);
  const minOut = (quoted * (BigInt(10000) - SLIPPAGE_BPS)) / BigInt(10000);
  if (minOut === BigInt(0)) throw new Error("quote rounds to zero");

  const wallet = walletClient(account);
  const client = publicClient();

  // 1. Fund the pair.
  const transferHash = await wallet.sendTransaction({
    to: tokenIn as `0x${string}`,
    data: encodeFunctionData({
      abi: ERC20,
      functionName: "transfer",
      args: [info.pair as `0x${string}`, amountIn],
    }),
  });
  const transferRcpt = await client.waitForTransactionReceipt({
    hash: transferHash,
    timeout: 60_000,
  });
  if (transferRcpt.status !== "success") throw new Error("funding transfer reverted");

  // 2. Ask the pair for our pre-computed output. K-check reverts on slippage.
  const [amount0Out, amount1Out] = inIs0 ? [BigInt(0), minOut] : [minOut, BigInt(0)];
  const balBefore = await erc20Balance(tokenOut, account.address);
  const swapHash = await wallet.sendTransaction({
    to: info.pair as `0x${string}`,
    data: encodeFunctionData({
      abi: PAIR,
      functionName: "swap",
      args: [amount0Out, amount1Out, account.address, "0x"],
    }),
  });
  const swapRcpt = await client.waitForTransactionReceipt({ hash: swapHash, timeout: 60_000 });
  if (swapRcpt.status !== "success") {
    throw new Error(`swap reverted (funds recoverable at pair ${info.pair}) tx=${swapHash}`);
  }
  const balAfter = await erc20Balance(tokenOut, account.address);

  return { txHash: swapHash, amountIn, amountOut: balAfter - balBefore };
}

/** Send an ERC-20 balance to the owner. Used exclusively by withdrawals. */
export async function transferAllToOwner(
  account: PrivateKeyAccount,
  token: string,
  owner: string
): Promise<string | null> {
  const bal = await erc20Balance(token, account.address);
  if (bal === BigInt(0)) return null;
  const wallet = walletClient(account);
  const hash = await wallet.sendTransaction({
    to: token as `0x${string}`,
    data: encodeFunctionData({
      abi: ERC20,
      functionName: "transfer",
      args: [owner as `0x${string}`, bal],
    }),
  });
  await publicClient().waitForTransactionReceipt({ hash, timeout: 60_000 });
  return hash;
}

/** Send remaining native ETH minus a gas reserve to the owner. */
export async function sweepEthToOwner(
  account: PrivateKeyAccount,
  owner: string
): Promise<string | null> {
  const client = publicClient();
  const bal = await client.getBalance({ address: account.address });
  const gasPrice = await client.getGasPrice();
  const fee = gasPrice * BigInt(2) * BigInt(21000);
  if (bal <= fee * BigInt(2)) return null;
  const wallet = walletClient(account);
  const hash = await wallet.sendTransaction({
    to: owner as `0x${string}`,
    value: bal - fee * BigInt(2),
  });
  await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  return hash;
}
