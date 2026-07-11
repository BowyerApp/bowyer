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

/** Server-side RPC endpoint (override with CHAIN_RPC_URL, e.g. an Alchemy key). */
export function rpcUrl(): string {
  return process.env.CHAIN_RPC_URL ?? ACTIVE_CHAIN.rpcUrls[0];
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
