/**
 * Robinhood Chain network config — real values from docs.robinhood.com/chain.
 * Shared between the browser wallet and server-side payment verification.
 *
 * Default network is testnet (free faucet ETH) so payments can be tested
 * end-to-end. Set NEXT_PUBLIC_BOWYER_NETWORK=mainnet for production.
 */

import { fallback, http } from "viem";

export const CHAINS = {
  mainnet: {
    chainId: "0x1237", // 4663
    chainIdDecimal: 4663,
    chainName: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
    blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  },
  testnet: {
    chainId: "0xb626", // 46630
    chainIdDecimal: 46630,
    chainName: "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
    blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
  },
} as const;

const network =
  process.env.NEXT_PUBLIC_BOWYER_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const ACTIVE_CHAIN = CHAINS[network];

/**
 * Server-side RPC endpoint pool.
 * - CHAIN_RPC_URLS: comma-separated list of endpoints (e.g. Alchemy + ArrowRPC + public),
 *   rotated round-robin so retries after a 429 land on a different provider.
 * - CHAIN_RPC_URL: single endpoint override (kept for backwards compatibility).
 * - Falls back to the rate-limited public RPC when neither is set.
 */
let rpcCursor = 0;

function rpcPool(): string[] {
  const configured: string[] = [];
  const multi = process.env.CHAIN_RPC_URLS?.trim();
  if (multi) configured.push(...multi.split(",").map((u) => u.trim()).filter(Boolean));
  else {
    const single = process.env.CHAIN_RPC_URL?.trim();
    if (single) configured.push(single);
  }
  // Official RPC rides along as a last resort so a single dead provider
  // (e.g. ArrowRPC behind a broken Cloudflare tunnel) can't take trading down.
  for (const official of ACTIVE_CHAIN.rpcUrls) {
    if (!configured.includes(official)) configured.push(official);
  }
  return configured;
}

export function rpcUrl(): string {
  const pool = rpcPool();
  const url = pool[rpcCursor % pool.length];
  rpcCursor = (rpcCursor + 1) % pool.length;
  return url;
}

/**
 * Viem transport with automatic failover: when one provider is down (e.g. a
 * Cloudflare 530 from a dead tunnel), the request retries on the next
 * endpoint in the pool instead of surfacing the outage to the caller.
 */
let fallbackTransportCache: ReturnType<typeof fallback> | null = null;

export function rpcFallbackTransport() {
  // Memoized: rank() pings providers in the background and reorders them by
  // health, which only pays off if the same transport instance is reused.
  if (!fallbackTransportCache) {
    const pool = rpcPool();
    fallbackTransportCache = fallback(
      // No per-transport retries: a dead endpoint costs one ~6s timeout, then
      // the request moves to the next provider.
      pool.map((u) => http(u, { retryCount: 0, timeout: 6_000 })),
      { retryCount: 1, rank: true }
    );
  }
  return fallbackTransportCache;
}

/** Canonical USDG on Robinhood Chain mainnet (Paxos). */
export const USDG_ADDRESS = (
  process.env.NEXT_PUBLIC_USDG_ADDRESS?.trim() ||
  process.env.USDG_ADDRESS?.trim() ||
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"
).toLowerCase();

export const USDG_DECIMALS = 6;

/** Conversion rate for pricing USD amounts in native ETH. */
// Rough ETH/USD used for on-chain depth estimates when no oracle is available.
// Override with USD_PER_ETH env; keep loosely current — stale values skew
// every USD figure derived from raw WETH balances.
export const USD_PER_ETH = Number(process.env.USD_PER_ETH) > 0 ? Number(process.env.USD_PER_ETH) : 1950;

export function usdToWei(usd: number): bigint {
  return BigInt(Math.round((usd / USD_PER_ETH) * 1e6)) * BigInt(1e12);
}

export function usdToWeiHex(usd: number): string {
  return `0x${usdToWei(usd).toString(16)}`;
}

export function usdToEthLabel(usd: number): string {
  return `${(usd / USD_PER_ETH).toFixed(4)} ETH`;
}
