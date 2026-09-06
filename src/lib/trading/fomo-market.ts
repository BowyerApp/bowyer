import type { ScreenerToken } from "@/lib/market-data";

const RHC_NETWORK_ID = 4663;
const EXPLORER = "https://robinhoodchain.blockscout.com";
const CACHE_MS = 2 * 60_000;

interface FomoVerifiedToken {
  change24?: string | number | null;
  createdAt?: number | null;
  holders?: number | null;
  liquidity?: string | number | null;
  marketCap?: string | number | null;
  priceUSD?: string | number | null;
  volume24?: string | number | null;
  token?: {
    address?: string;
    networkId?: number;
    name?: string;
    symbol?: string;
    info?: {
      imageLargeUrl?: string | null;
      socialLinks?: {
        twitter?: string | null;
        website?: string | null;
      };
    };
    socialLinks?: {
      twitter?: string | null;
      website?: string | null;
    };
  };
}

let cache: { at: number; rows: ScreenerToken[] } | null = null;
let inFlight: Promise<ScreenerToken[]> | null = null;

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isEquity(name: string, symbol: string): boolean {
  return /•\s*Robinhood|Robinhood Tokenized/i.test(name) || /x$/i.test(symbol);
}

function toScreener(row: FomoVerifiedToken): ScreenerToken | null {
  const token = row.token;
  const address = token?.address?.toLowerCase() ?? "";
  const name = token?.name?.trim() ?? "Unknown";
  const symbol = token?.symbol?.trim() ?? "?";
  const priceUsd = finite(row.priceUSD);
  if (
    token?.networkId !== RHC_NETWORK_ID ||
    !address.startsWith("0x") ||
    !priceUsd ||
    priceUsd <= 0 ||
    isEquity(name, symbol)
  ) {
    return null;
  }
  const createdMs = Number(row.createdAt ?? 0) * 1000;
  const ageMinutes = createdMs > 0 ? Math.max(0, Math.round((Date.now() - createdMs) / 60_000)) : null;
  const socials = token?.socialLinks ?? token?.info?.socialLinks;
  return {
    address,
    name,
    symbol,
    imageUrl: token?.info?.imageLargeUrl ?? null,
    priceUsd,
    change5m: null,
    change1h: null,
    // Fomo returns decimal price change (0.12 = 12%).
    change24h: finite(row.change24) == null ? null : Number(row.change24) * 100,
    mcap: finite(row.marketCap),
    liquidityUsd: finite(row.liquidity),
    volume24h: finite(row.volume24),
    buys24h: null,
    sells24h: null,
    holders: finite(row.holders),
    ageMinutes,
    pairAddress: null,
    dexId: "fomo verified",
    dexUrl: `https://fomo.family/tokens/robinhood/${address}`,
    website: socials?.website ?? null,
    twitter: socials?.twitter ?? null,
    explorerUrl: `${EXPLORER}/address/${address}`,
    agent: null,
    riskLevel: null,
    riskScore: null,
    top10Pct: null,
    riskFlags: [],
    spark: [],
    fresh: ageMinutes != null && ageMinutes < 24 * 60,
    kind: "meme",
  };
}

async function fetchRows(): Promise<ScreenerToken[]> {
  const { fomoApi } = await import("@/lib/trading/fomo-thesis");
  const response = (await fomoApi("/proxy/verifiedTokens")) as FomoVerifiedToken[];
  return (Array.isArray(response) ? response : [])
    .map(toScreener)
    .filter((row): row is ScreenerToken => row !== null)
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
}

/**
 * RHC tokens Fomo itself verifies and can execute. This closes the discovery
 * gap between the chain index/radar and the much broader universe visible in
 * the Fomo app.
 */
export async function fomoRhcScreener(): Promise<ScreenerToken[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  if (!inFlight) {
    inFlight = fetchRows()
      .then((rows) => {
        cache = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  if (cache) return cache.rows;
  return inFlight;
}
