/**
 * Robinhood Chain Stock Token desk data.
 * Prices from DexScreener when available; Chainlink-style reference is approximated
 * via the pool's priceUsd when a matching pool exists.
 */

import { USDG_ADDRESS } from "@/lib/chain";

export interface StockToken {
  symbol: string;
  name: string;
  address: string;
  /** Underlying equity ticker when known */
  underlying?: string;
}

/** Curated liquid / recognizable Stock Tokens on Robinhood Chain. */
export const STOCK_TOKEN_SEED: StockToken[] = [
  { symbol: "AAPLx", name: "Apple", address: "", underlying: "AAPL" },
  { symbol: "TSLAx", name: "Tesla", address: "", underlying: "TSLA" },
  { symbol: "NVDAx", name: "NVIDIA", address: "", underlying: "NVDA" },
  { symbol: "AMZNx", name: "Amazon", address: "", underlying: "AMZN" },
  { symbol: "GOOGLx", name: "Alphabet", address: "", underlying: "GOOGL" },
  { symbol: "METAx", name: "Meta", address: "", underlying: "META" },
  { symbol: "MSFTx", name: "Microsoft", address: "", underlying: "MSFT" },
  { symbol: "SPYx", name: "S&P 500 ETF", address: "", underlying: "SPY" },
  { symbol: "QQQx", name: "Nasdaq-100 ETF", address: "", underlying: "QQQ" },
  { symbol: "COINx", name: "Coinbase", address: "", underlying: "COIN" },
];

export interface StockTokenQuote {
  symbol: string;
  name: string;
  address: string | null;
  underlying: string | null;
  dexPriceUsd: number | null;
  referencePriceUsd: number | null;
  premiumDiscountPct: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  pairUrl: string | null;
  updatedAt: string;
}

interface DexPair {
  chainId?: string;
  url?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { address?: string; symbol?: string };
  priceChange?: { h24?: number };
}

const dexChain = () =>
  process.env.DEXSCREENER_CHAIN_ID?.trim() || "robinhood";

async function searchDex(query: string): Promise<DexPair[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 bowyer-desk" },
        signal: AbortSignal.timeout(12_000),
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { pairs?: DexPair[] };
    const chain = dexChain().toLowerCase();
    return (json.pairs ?? []).filter(
      (p) =>
        (p.chainId ?? "").toLowerCase().includes(chain) ||
        (p.chainId ?? "").toLowerCase() === "robinhood" ||
        (p.chainId ?? "").toLowerCase().includes("4663")
    );
  } catch {
    return [];
  }
}

function pickBestPair(pairs: DexPair[], symbol: string): DexPair | null {
  const sym = symbol.replace(/x$/i, "").toUpperCase();
  const scored = pairs
    .map((p) => {
      const base = (p.baseToken?.symbol ?? "").toUpperCase();
      const match =
        base === symbol.toUpperCase() ||
        base === `${sym}X` ||
        base.includes(sym) ||
        (p.baseToken?.name ?? "").toUpperCase().includes(sym);
      const liq = p.liquidity?.usd ?? 0;
      return { p, score: (match ? 1_000_000 : 0) + liq };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

/** No-key equity spot: Yahoo Finance chart meta, Stooq CSV as fallback. */
async function referenceSpot(underlying: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        underlying.toUpperCase()
      )}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 bowyer-desk", Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
        next: { revalidate: 120 },
      }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        chart?: { result?: { meta?: { regularMarketPrice?: number } }[] };
      };
      const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof price === "number" && Number.isFinite(price) && price > 0) return price;
    }
  } catch {
    /* fall through to stooq */
  }
  try {
    const res = await fetch(
      `https://stooq.com/q/l/?s=${underlying.toLowerCase()}.us&f=sd2t2ohlcv&e=csv`,
      { signal: AbortSignal.timeout(8_000), next: { revalidate: 120 } }
    );
    if (!res.ok) return null;
    const text = await res.text();
    const line = text.trim().split("\n")[1];
    if (!line) return null;
    const close = Number(line.split(",")[6]);
    return Number.isFinite(close) && close > 0 ? close : null;
  } catch {
    return null;
  }
}

export async function getStockTokenQuotes(
  symbols?: string[]
): Promise<StockTokenQuote[]> {
  const seed = symbols?.length
    ? STOCK_TOKEN_SEED.filter((t) =>
        symbols!.some((s) => s.toUpperCase() === t.symbol.toUpperCase() || s.toUpperCase() === t.underlying?.toUpperCase())
      )
    : STOCK_TOKEN_SEED;

  return Promise.all(
    seed.map(async (token) => {
      const pairs = await searchDex(
        `${token.symbol} OR ${token.underlying ?? ""} Robinhood`
      );
      let pair = pickBestPair(pairs, token.symbol);
      let dexPrice = pair?.priceUsd ? Number(pair.priceUsd) : null;
      const ref = token.underlying ? await referenceSpot(token.underlying) : null;
      // DexScreener search can match unrelated memecoins with similar tickers.
      // If the pool price is more than 2x away from the equity spot, it is not
      // the Stock Token — drop the pair rather than show a fake price.
      if (dexPrice != null && ref != null && ref > 0) {
        const ratio = dexPrice / ref;
        if (ratio < 0.5 || ratio > 2) {
          pair = null;
          dexPrice = null;
        }
      }
      let premium: number | null = null;
      if (dexPrice && ref && ref > 0) {
        premium = ((dexPrice - ref) / ref) * 100;
      }
      return {
        symbol: token.symbol,
        name: token.name,
        address: pair?.baseToken?.address ?? null,
        underlying: token.underlying ?? null,
        dexPriceUsd: dexPrice != null && Number.isFinite(dexPrice) ? dexPrice : null,
        referencePriceUsd: ref,
        premiumDiscountPct: premium !== null && Number.isFinite(premium) ? premium : null,
        liquidityUsd: pair?.liquidity?.usd ?? null,
        volume24hUsd: pair?.volume?.h24 ?? null,
        pairUrl: pair?.url ?? null,
        updatedAt: new Date().toISOString(),
      };
    })
  );
}

export { USDG_ADDRESS };
