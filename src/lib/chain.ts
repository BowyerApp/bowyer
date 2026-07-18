/**
 * Robinhood Chain network config — real values from docs.robinhood.com/chain.
 * Shared between the browser wallet and server-side payment verification.
 *
 * Default network is testnet (free faucet ETH) so payments can be tested
 * end-to-end. Set NEXT_PUBLIC_BOWYER_NETWORK=mainnet for production.
 */

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
  const multi = process.env.CHAIN_RPC_URLS?.trim();
  if (multi) {
    const urls = multi.split(",").map((u) => u.trim()).filter(Boolean);
    if (urls.length > 0) return urls;
  }
  const single = process.env.CHAIN_RPC_URL?.trim();
  return single ? [single] : [...ACTIVE_CHAIN.rpcUrls];
}

export function rpcUrl(): string {
  const pool = rpcPool();
  const url = pool[rpcCursor % pool.length];
  rpcCursor = (rpcCursor + 1) % pool.length;
  return url;
}

/** Conversion rate for pricing USD amounts in native ETH. */
export const USD_PER_ETH = 3200;

export function usdToWei(usd: number): bigint {
  return BigInt(Math.round((usd / USD_PER_ETH) * 1e6)) * BigInt(1e12);
}

export function usdToWeiHex(usd: number): string {
  return `0x${usdToWei(usd).toString(16)}`;
}

export function usdToEthLabel(usd: number): string {
  return `${(usd / USD_PER_ETH).toFixed(4)} ETH`;
}
