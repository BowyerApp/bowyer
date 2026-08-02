import { getMemeRadar, scanTokenRisk, type TokenRiskScan } from "@/lib/meme-radar";
import { getStockTokenQuotes } from "@/lib/stock-tokens";
import { db, dbAvailable } from "@/lib/db";

/**
 * Market data layer for the V2 terminal.
 *
 * Every number served here is real:
 * - Launch discovery comes from the meme radar (Uniswap v2/v3 pool events).
 * - Prices/volumes/liquidity come from DexScreener for Robinhood Chain.
 * - Holder distribution and risk verdicts come from scanTokenRisk
 *   (RPC + Blockscout), cached and refreshed in the background.
 * - Sparklines come from our own price snapshots recorded on each refresh.
 */

const DEXSCREENER_CHAIN_ID = process.env.DEXSCREENER_CHAIN_ID?.trim() || "robinhood";
const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_BASE?.trim() || "https://robinhoodchain.blockscout.com/api/v2";
export const EXPLORER_BASE = "https://robinhoodchain.blockscout.com";
export const BOWYER_TOKEN = "0xaf4c10fef50059d1e3e8ab1c80e46db6a76098b4";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

const TIMEOUT_MS = 12_000;
const SCREENER_TTL_MS = 45_000;
// The radar's log scan is the expensive part; prices refresh independently,
// so a 5-minute launch-detection cadence keeps RPC load sane.
const RADAR_TTL_MS = 5 * 60_000;
const RISK_TTL_MS = 15 * 60_000;
const MAX_RISK_SCANS_PER_REFRESH = 4;

export type AgentVerdict = "passed" | "review" | "failed";

export interface ScreenerToken {
  address: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  priceUsd: number | null;
  change5m: number | null;
  change1h: number | null;
  change24h: number | null;
  mcap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  holders: number | null;
  ageMinutes: number | null;
  pairAddress: string | null;
  dexId: string | null;
  dexUrl: string | null;
  website: string | null;
  twitter: string | null;
  explorerUrl: string;
  agent: AgentVerdict | null;
  riskLevel: TokenRiskScan["riskLevel"] | null;
  riskScore: number | null;
  top10Pct: number | null;
  riskFlags: string[];
  spark: number[];
  fresh: boolean;
  kind: "meme" | "equity";
}

/* ---------------- DexScreener ---------------- */

interface DexPairFull {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
  priceUsd?: string;
  txns?: Record<string, { buys?: number; sells?: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { url?: string }[];
    socials?: { type?: string; url?: string }[];
  };
}

async function fetchDexPairsFor(addresses: string[]): Promise<Map<string, DexPairFull>> {
  const best = new Map<string, DexPairFull>();
  // DexScreener accepts up to 30 comma-separated token addresses per call.
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30);
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`,
        { headers: { "User-Agent": "bowyer-terminal" }, signal: AbortSignal.timeout(TIMEOUT_MS) }
      );
      if (!res.ok) continue;
      const body = (await res.json()) as { pairs?: DexPairFull[] };
      for (const pair of body.pairs ?? []) {
        if (pair.chainId !== DEXSCREENER_CHAIN_ID) continue;
        const base = pair.baseToken?.address?.toLowerCase();
        if (!base) continue;
        const current = best.get(base);
        if (!current || (pair.liquidity?.usd ?? 0) > (current.liquidity?.usd ?? 0)) {
          best.set(base, pair);
        }
      }
    } catch {
      // Partial data beats no data; other batches may still succeed.
    }
  }
  return best;
}

/**
 * Symbols scam tokens use to impersonate core assets. A legitimate new project
 * does not name itself after the chain's stablecoin or wrapped native asset.
 */
const CORE_IMPERSONATOR_SYMBOLS = new Set([
  "usdg",
  "weth",
  "usdc",
  "usdt",
  "dai",
  "eth",
  "wbtc",
  "wsteth",
  "steth",
]);

function isImpersonator(symbol: string | null | undefined): boolean {
  return CORE_IMPERSONATOR_SYMBOLS.has((symbol ?? "").toLowerCase());
}

/**
 * A pool with millions in supposed liquidity but no trading is a fake-valued
 * pool (scammers seed pools so DexScreener extrapolates a bogus USD figure).
 */
function isFakeValued(pair: DexPairFull): boolean {
  const liquidity = pair.liquidity?.usd ?? 0;
  const volume = pair.volume?.h24 ?? 0;
  return liquidity > 5_000_000 && volume < 1_000;
}

interface UniverseEntry {
  address: string;
  name: string | null;
  symbol: string | null;
  holders: number | null;
  exchangeRate: number | null;
  circulatingMcap: number | null;
}

interface BlockscoutTokenItem {
  address_hash?: string;
  address?: string;
  name?: string | null;
  symbol?: string | null;
  holders_count?: string | number | null;
  holders?: string | number | null;
  exchange_rate?: string | null;
  circulating_market_cap?: string | null;
  type?: string;
}

/**
 * Chain-truth token universe from the Blockscout indexer, sorted by
 * circulating market cap. DexScreener has no top-tokens-by-chain endpoint and
 * its text search misses this chain almost entirely, so the block explorer's
 * own token index is the honest source.
 */
async function blockscoutUniverse(): Promise<UniverseEntry[]> {
  try {
    const res = await fetch(`${BLOCKSCOUT_API}/tokens?type=ERC-20`, {
      headers: { "User-Agent": "bowyer-terminal" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: BlockscoutTokenItem[] };
    const entries: UniverseEntry[] = [];
    for (const item of body.items ?? []) {
      const address = (item.address_hash ?? item.address ?? "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(address)) continue;
      if (address === USDG) continue;
      if (isImpersonator(item.symbol)) continue;
      // Stablecoins are quote assets, not screener content.
      if (/usd/i.test(item.symbol ?? "")) continue;
      const holders = Number(item.holders_count ?? item.holders ?? NaN);
      const rate = Number(item.exchange_rate ?? NaN);
      const mcap = Number(item.circulating_market_cap ?? NaN);
      // Fewer than 10 holders in the top-50-by-mcap list means wash inflation.
      if (Number.isFinite(holders) && holders < 10) continue;
      entries.push({
        address,
        name: item.name ?? null,
        symbol: item.symbol ?? null,
        holders: Number.isFinite(holders) ? holders : null,
        exchangeRate: Number.isFinite(rate) ? rate : null,
        circulatingMcap: Number.isFinite(mcap) ? mcap : null,
      });
    }
    return entries.slice(0, 40);
  } catch {
    return [];
  }
}

/* ---------------- risk scan cache ---------------- */

const riskCache = new Map<string, { scan: TokenRiskScan; at: number }>();
const riskInFlight = new Set<string>();

function verdictFrom(scan: TokenRiskScan): AgentVerdict {
  if (scan.riskLevel === "low") return "passed";
  if (scan.riskLevel === "medium") return "review";
  return "failed";
}

/**
 * A token that actively trades on a DEX cannot have "no bytecode" — when the
 * scanner says so, its RPC calls failed and the verdict is garbage. Evict and
 * rescan instead of showing a false "critical".
 */
function scanLooksBroken(scan: TokenRiskScan, tradesOnDex: boolean): boolean {
  return tradesOnDex && scan.bytecodeBytes === 0;
}

function queueRiskScans(addresses: string[]) {
  let started = 0;
  for (const address of addresses) {
    if (started >= MAX_RISK_SCANS_PER_REFRESH) break;
    const cached = riskCache.get(address);
    if (cached && Date.now() - cached.at < RISK_TTL_MS) continue;
    if (riskInFlight.has(address)) continue;
    riskInFlight.add(address);
    started++;
    scanTokenRisk(address)
      .then((scan) => {
        // Don't cache contradictory scans (no bytecode but live market data).
        if (!scanLooksBroken(scan, scan.market !== null)) {
          riskCache.set(address, { scan, at: Date.now() });
        }
      })
      .catch(() => {})
      .finally(() => riskInFlight.delete(address));
  }
}

export function riskScanFor(address: string): TokenRiskScan | null {
  return riskCache.get(address.toLowerCase())?.scan ?? null;
}

/* ---------------- price snapshots (sparklines) ---------------- */

let sparkTableReady = false;

function ensureSparkTable(): boolean {
  if (!dbAvailable()) return false;
  if (!sparkTableReady) {
    db().exec(`
      CREATE TABLE IF NOT EXISTS market_spark (
        token TEXT NOT NULL,
        ts INTEGER NOT NULL,
        price REAL NOT NULL,
        PRIMARY KEY (token, ts)
      );
      CREATE INDEX IF NOT EXISTS idx_market_spark_token_ts ON market_spark(token, ts);
    `);
    sparkTableReady = true;
  }
  return true;
}

function recordSnapshots(rows: { address: string; priceUsd: number | null }[]) {
  if (!ensureSparkTable()) return;
  // Bucket to 2-minute slots so refresh frequency doesn't bloat the table.
  const bucket = Math.floor(Date.now() / 120_000) * 120;
  const insert = db().prepare(
    "INSERT OR IGNORE INTO market_spark (token, ts, price) VALUES (?, ?, ?)"
  );
  const tx = db().transaction(() => {
    for (const row of rows) {
      if (row.priceUsd && row.priceUsd > 0) insert.run(row.address, bucket, row.priceUsd);
    }
    // Keep 48h of history.
    db().prepare("DELETE FROM market_spark WHERE ts < ?").run(bucket - 48 * 3600);
  });
  try {
    tx();
  } catch {
    // Sparkline history is best-effort.
  }
}

function sparkFor(address: string, points = 24): number[] {
  if (!ensureSparkTable()) return [];
  try {
    const rows = db()
      .prepare("SELECT price FROM market_spark WHERE token = ? ORDER BY ts DESC LIMIT ?")
      .all(address, points) as { price: number }[];
    return rows.map((r) => r.price).reverse();
  } catch {
    return [];
  }
}

/* ---------------- radar cache ---------------- */

type RadarResult = Awaited<ReturnType<typeof getMemeRadar>>;
let radarCache: { data: RadarResult; at: number } | null = null;
let radarInFlight: Promise<RadarResult> | null = null;

async function cachedRadar(): Promise<RadarResult | null> {
  if (radarCache && Date.now() - radarCache.at < RADAR_TTL_MS) return radarCache.data;
  if (!radarInFlight) {
    radarInFlight = getMemeRadar()
      .then((data) => {
        radarCache = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        radarInFlight = null;
      });
  }
  // Serve stale data instantly when we have it; refresh happens in background.
  if (radarCache) return radarCache.data;
  try {
    return await radarInFlight;
  } catch {
    return null;
  }
}

/* ---------------- screener ---------------- */

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface LaunchHint {
  name: string | null;
  symbol: string | null;
  ageMinutes: number | null;
  dex: string;
  onChainDepthUsd: number | null;
}

function rowFromPair(
  address: string,
  pair: DexPairFull | undefined,
  fresh: boolean,
  hint?: LaunchHint,
  universe?: UniverseEntry
): ScreenerToken {
  const price = pair ? Number(pair.priceUsd) : NaN;
  const websites = pair?.info?.websites ?? [];
  const socials = pair?.info?.socials ?? [];
  const twitter =
    socials.find((s) => (s.type ?? "").toLowerCase() === "twitter")?.url ?? null;
  const created = pair?.pairCreatedAt ? Number(pair.pairCreatedAt) : null;
  const scanEntry = riskCache.get(address);
  let scan = scanEntry && Date.now() - scanEntry.at < RISK_TTL_MS * 4 ? scanEntry.scan : null;
  if (scan && scanLooksBroken(scan, Boolean(pair))) {
    riskCache.delete(address);
    scan = null;
  }
  const rowName = pair?.baseToken?.name ?? hint?.name ?? universe?.name ?? scan?.name ?? "Unknown";
  const rowSymbol = pair?.baseToken?.symbol ?? hint?.symbol ?? universe?.symbol ?? scan?.symbol ?? "?";
  const isEquity = isTokenizedEquity(
    pair?.baseToken?.name ?? universe?.name ?? null,
    pair?.baseToken?.symbol ?? universe?.symbol ?? null
  );
  return {
    address,
    name: rowName,
    symbol: rowSymbol,
    imageUrl: pair?.info?.imageUrl ?? (isEquity ? equityLogoUrl(rowSymbol) : null),
    priceUsd: Number.isFinite(price) ? price : universe?.exchangeRate ?? null,
    change5m: num(pair?.priceChange?.m5),
    change1h: num(pair?.priceChange?.h1),
    change24h: num(pair?.priceChange?.h24),
    mcap: num(pair?.marketCap) ?? num(pair?.fdv) ?? universe?.circulatingMcap ?? null,
    // Fresh pools DexScreener hasn't indexed yet still have measurable
    // on-chain depth from the radar's pool balance check.
    liquidityUsd: num(pair?.liquidity?.usd) ?? hint?.onChainDepthUsd ?? null,
    volume24h: num(pair?.volume?.h24),
    buys24h: num(pair?.txns?.h24?.buys),
    sells24h: num(pair?.txns?.h24?.sells),
    holders: universe?.holders ?? scan?.holders?.count ?? null,
    ageMinutes: created
      ? Math.max(0, Math.round((Date.now() - created) / 60_000))
      : hint?.ageMinutes ?? null,
    pairAddress: pair?.pairAddress ?? null,
    dexId: pair?.dexId ?? (hint ? `uniswap ${hint.dex}` : null),
    dexUrl: pair?.url ?? null,
    website: websites[0]?.url ?? null,
    twitter,
    explorerUrl: `${EXPLORER_BASE}/address/${address}`,
    agent: scan ? verdictFrom(scan) : riskInFlight.has(address) ? "review" : null,
    riskLevel: scan?.riskLevel ?? null,
    riskScore: scan?.riskScore ?? null,
    top10Pct: scan?.holders?.top10Pct ?? null,
    riskFlags: scan?.flags ?? [],
    spark: sparkFor(address),
    fresh,
    kind: isEquity ? "equity" : "meme",
  };
}

/**
 * Company logo for a tokenized equity, keyed by its underlying ticker.
 * Robinhood tokens append a lowercase "x" (AAPLx, METAx) — strip it to reach
 * the real ticker. Parqet serves clean per-ticker logos; the UI falls back to
 * initials if a given ticker has no logo.
 */
export function equityLogoUrl(symbol: string, underlying?: string | null): string | null {
  const raw = (underlying || symbol || "").replace(/x$/, "");
  const ticker = raw.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  if (!ticker) return null;
  return `https://assets.parqet.com/logos/symbol/${ticker}?format=png&size=64`;
}

/** Robinhood's tokenized stocks carry a "• Robinhood" suffix in their name. */
function isTokenizedEquity(name: string | null, symbol: string | null): boolean {
  if (name && /•\s*Robinhood|Robinhood Tokenized/i.test(name)) return true;
  // ETF-style all-caps tickers with a dollar price and a known equity name
  // pattern (e.g. "SPDR S&P 500 ETF Trust") also count.
  if (name && /ETF Trust|S&P 500/i.test(name) && symbol === symbol?.toUpperCase()) return true;
  return false;
}

export interface ScreenerResult {
  updatedAt: string;
  signal: { level: string; headline: string } | null;
  tokens: ScreenerToken[];
}

let screenerCache: { data: ScreenerResult; at: number } | null = null;
let screenerInFlight: Promise<ScreenerResult> | null = null;

async function buildScreener(): Promise<ScreenerResult> {
  const [radar, universeList] = await Promise.all([cachedRadar(), blockscoutUniverse()]);
  const universe = new Map(universeList.map((entry) => [entry.address, entry]));
  const freshSet = new Set<string>();
  const hints = new Map<string, LaunchHint>();
  const addresses = new Set<string>([BOWYER_TOKEN]);

  if (radar) {
    // On hot tape the chain does hundreds of launches an hour; keep the most
    // recent/scored slice so the established universe keeps its table slots.
    for (const launch of (radar.launches ?? []).slice(0, 25)) {
      const token = launch.token?.toLowerCase();
      if (!token) continue;
      // A "fresh launch" of WETH/USDG etc. is either a scam impersonator or
      // an inverted base/quote read on a thin window — never real news.
      if (isImpersonator(launch.symbol)) continue;
      addresses.add(token);
      freshSet.add(token);
      const depth = launch.onChainDepthUsd;
      hints.set(token, {
        name: launch.name,
        symbol: launch.symbol,
        ageMinutes: launch.ageMinutes,
        dex: launch.dex,
        // A minutes-old pool with a claimed 7-figure depth is a mismeasure.
        onChainDepthUsd: depth !== null && depth < 5_000_000 ? depth : null,
      });
    }
    for (const leader of radar.marketLeaders ?? []) {
      const token = leader.token?.toLowerCase();
      if (token && token !== USDG && !isImpersonator(leader.symbol)) addresses.add(token);
    }
  }
  for (const token of universe.keys()) addresses.add(token);

  const list = [...addresses].slice(0, 90);
  const pairs = await fetchDexPairsFor(list);

  const rows: ScreenerToken[] = [];
  for (const address of list) {
    const pair = pairs.get(address);
    const inUniverse = universe.has(address);
    // Keep: fresh launches (interesting because they're minutes old), the
    // chain's indexed top tokens, and $BOWYER. Drop radar noise without a
    // priced pair or index entry.
    if (!pair && !freshSet.has(address) && !inUniverse && address !== BOWYER_TOKEN) continue;
    if (pair && address !== BOWYER_TOKEN) {
      if (isImpersonator(pair.baseToken?.symbol)) continue;
      if (isFakeValued(pair) && !freshSet.has(address)) continue;
    }
    rows.push(rowFromPair(address, pair, freshSet.has(address), hints.get(address), universe.get(address)));
  }

  recordSnapshots(rows.map((r) => ({ address: r.address, priceUsd: r.priceUsd })));
  for (const row of rows) row.spark = sparkFor(row.address);

  // Risk-scan the most visible tokens first (by volume), a few per refresh.
  queueRiskScans(
    rows
      .slice()
      .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
      .map((r) => r.address)
  );

  rows.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));

  return {
    updatedAt: new Date().toISOString(),
    signal: radar?.signal ?? null,
    tokens: rows,
  };
}

export async function getScreener(): Promise<ScreenerResult> {
  if (screenerCache && Date.now() - screenerCache.at < SCREENER_TTL_MS) return screenerCache.data;
  if (!screenerInFlight) {
    screenerInFlight = buildScreener()
      .then((data) => {
        screenerCache = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        screenerInFlight = null;
      });
  }
  if (screenerCache) return screenerCache.data;
  return screenerInFlight;
}

/** Fire-and-forget cache warmup so the first visitor doesn't eat the radar scan. */
export function prewarmMarketData() {
  getScreener().catch(() => {});
}

/**
 * Non-blocking cached read for server-side rendering. Returns the current
 * cached screener if we have one (even slightly stale) and kicks off a refresh
 * in the background; returns null instead of blocking on a cold radar scan so
 * a fresh deploy never makes the page hang. The client poll fills in the rest.
 */
export function getScreenerCached(): ScreenerResult | null {
  if (!screenerCache) {
    prewarmMarketData();
    return null;
  }
  if (Date.now() - screenerCache.at >= SCREENER_TTL_MS) prewarmMarketData();
  return screenerCache.data;
}

export function getMemeScreenerCached(): ScreenerResult | null {
  const all = getScreenerCached();
  if (!all) return null;
  return { ...all, tokens: all.tokens.filter((t) => t.kind === "meme") };
}

/**
 * Cached equities for SSR — the chain-indexed tokenized stocks only. Curated
 * seed quotes (which need Yahoo/Stooq calls) are added by the client poll.
 */
export function getEquityScreenerCached(): ScreenerResult | null {
  const all = getScreenerCached();
  if (!all) return null;
  return { ...all, tokens: all.tokens.filter((t) => t.kind === "equity") };
}

/** Meme/community tokens only — what the Discover tab shows. */
export async function getMemeScreener(): Promise<ScreenerResult> {
  const all = await getScreener();
  return { ...all, tokens: all.tokens.filter((t) => t.kind === "meme") };
}

/* ---------------- equities view ---------------- */

export async function getEquityScreener(): Promise<ScreenerResult> {
  // Primary source: tokenized equities found in the chain index (they carry
  // real volume/liquidity/holder data). Stock-token quotes fill in any
  // curated symbols the index page missed.
  const all = await getScreener();
  const rows = all.tokens.filter((t) => t.kind === "equity");
  const seen = new Set(rows.map((r) => r.symbol.replace(/x$/i, "").toUpperCase()));

  try {
    const quotes = await getStockTokenQuotes();
    for (const q of quotes) {
      const key = q.symbol.replace(/x$/i, "").toUpperCase();
      if (seen.has(key) || (q.dexPriceUsd === null && !q.address)) continue;
      // Symbol search can match scam pools with fake seeded liquidity.
      if ((q.liquidityUsd ?? 0) > 5_000_000 && (q.volume24hUsd ?? 0) < 1_000) continue;
      const address = (q.address ?? `equity:${q.symbol}`).toLowerCase();
      rows.push({
        address,
        name: q.name,
        symbol: q.symbol,
        imageUrl: equityLogoUrl(q.symbol, q.underlying),
        priceUsd: q.dexPriceUsd ?? q.referencePriceUsd,
        change5m: null,
        change1h: null,
        change24h: q.premiumDiscountPct,
        mcap: null,
        liquidityUsd: q.liquidityUsd,
        volume24h: q.volume24hUsd,
        buys24h: null,
        sells24h: null,
        holders: null,
        ageMinutes: null,
        pairAddress: null,
        dexId: null,
        dexUrl: q.pairUrl,
        website: null,
        twitter: null,
        explorerUrl: q.address ? `${EXPLORER_BASE}/address/${q.address}` : EXPLORER_BASE,
        agent: null,
        riskLevel: null,
        riskScore: null,
        top10Pct: null,
        riskFlags: [],
        spark: q.address ? sparkFor(address) : [],
        fresh: false,
        kind: "equity" as const,
      });
    }
  } catch {
    // Chain-indexed rows alone are fine.
  }

  rows.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
  return { updatedAt: all.updatedAt, signal: null, tokens: rows };
}

/* ---------------- token detail ---------------- */

export interface TokenTrade {
  hash: string;
  side: "buy" | "sell";
  amount: number;
  amountUsd: number | null;
  wallet: string;
  timestamp: string;
}

export interface TokenDetail {
  token: ScreenerToken;
  pairs: {
    pairAddress: string;
    dexId: string;
    quoteSymbol: string | null;
    priceUsd: number | null;
    liquidityUsd: number | null;
    volume24h: number | null;
    url: string | null;
  }[];
  scan: TokenRiskScan | null;
  trades: TokenTrade[];
}

interface BlockscoutTransfer {
  transaction_hash?: string;
  timestamp?: string;
  from?: { hash?: string };
  to?: { hash?: string };
  total?: { value?: string; decimals?: string };
  token?: { address_hash?: string; address?: string; decimals?: string };
}

async function recentTrades(
  tokenAddress: string,
  pairAddress: string,
  priceUsd: number | null,
  decimalsHint: number | null
): Promise<TokenTrade[]> {
  try {
    const res = await fetch(
      `${BLOCKSCOUT_API}/addresses/${pairAddress}/token-transfers?type=ERC-20`,
      { headers: { "User-Agent": "bowyer-terminal" }, signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: BlockscoutTransfer[] };
    const pair = pairAddress.toLowerCase();
    const trades: TokenTrade[] = [];
    for (const item of body.items ?? []) {
      const transferToken = (item.token?.address_hash ?? item.token?.address ?? "").toLowerCase();
      if (transferToken !== tokenAddress) continue;
      const from = (item.from?.hash ?? "").toLowerCase();
      const to = (item.to?.hash ?? "").toLowerCase();
      // Base token leaving the pool = a buy; entering the pool = a sell.
      let side: "buy" | "sell" | null = null;
      let wallet = "";
      if (from === pair && to && to !== pair) {
        side = "buy";
        wallet = to;
      } else if (to === pair && from && from !== pair) {
        side = "sell";
        wallet = from;
      }
      if (!side) continue;
      const decimals = Number(item.total?.decimals ?? item.token?.decimals ?? decimalsHint ?? 18);
      const raw = Number(item.total?.value ?? 0);
      const amount = raw / 10 ** (Number.isFinite(decimals) ? decimals : 18);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      trades.push({
        hash: item.transaction_hash ?? "",
        side,
        amount,
        amountUsd: priceUsd ? amount * priceUsd : null,
        wallet,
        timestamp: item.timestamp ?? "",
      });
      if (trades.length >= 30) break;
    }
    return trades;
  } catch {
    return [];
  }
}

const TOKEN_DETAIL_TTL_MS = 20_000;
const tokenDetailCache = new Map<string, { data: TokenDetail; at: number }>();
const tokenDetailInFlight = new Map<string, Promise<TokenDetail>>();

export async function getTokenDetail(address: string): Promise<TokenDetail> {
  const normalized = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) throw new Error("A valid token address is required");

  const cached = tokenDetailCache.get(normalized);
  if (cached && Date.now() - cached.at < TOKEN_DETAIL_TTL_MS) return cached.data;
  const inFlight = tokenDetailInFlight.get(normalized);
  if (inFlight) return inFlight;

  const promise = buildTokenDetail(normalized)
    .then((data) => {
      tokenDetailCache.set(normalized, { data, at: Date.now() });
      if (tokenDetailCache.size > 200) {
        const oldest = [...tokenDetailCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) tokenDetailCache.delete(oldest[0]);
      }
      return data;
    })
    .finally(() => {
      tokenDetailInFlight.delete(normalized);
    });
  tokenDetailInFlight.set(normalized, promise);
  // Serve slightly stale data instantly while the refresh happens in background.
  if (cached) return cached.data;
  return promise;
}

/**
 * Non-blocking cached read for SSR: returns the cached detail if we have one
 * and warms the cache in the background otherwise. Never blocks navigation.
 */
export function getTokenDetailCached(address: string): TokenDetail | null {
  const normalized = address.toLowerCase();
  const cached = tokenDetailCache.get(normalized);
  getTokenDetail(normalized).catch(() => {});
  return cached?.data ?? null;
}

async function buildTokenDetail(normalized: string): Promise<TokenDetail> {

  // The risk scan can take several seconds on a cold token (RPC + Blockscout
  // holder crawl), so give it a short budget here. If it misses the window it
  // keeps running in the background and lands in riskCache for the next poll.
  const scanPromise = (async () => {
    const cachedScan = riskCache.get(normalized);
    if (cachedScan && Date.now() - cachedScan.at < RISK_TTL_MS) return cachedScan.scan;
    try {
      const scan = await scanTokenRisk(normalized);
      riskCache.set(normalized, { scan, at: Date.now() });
      return scan;
    } catch {
      return null;
    }
  })();

  const [pairsMap, scanRaw] = await Promise.all([
    fetchDexPairsFor([normalized]),
    Promise.race([
      scanPromise,
      new Promise<TokenRiskScan | null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]),
  ]);

  let scanSettled = scanRaw;
  if (scanSettled && scanLooksBroken(scanSettled, pairsMap.has(normalized))) {
    riskCache.delete(normalized);
    scanSettled = null;
  }

  // All pairs for this token (not just the best one).
  let allPairs: DexPairFull[] = [];
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${normalized}`, {
      headers: { "User-Agent": "bowyer-terminal" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const body = (await res.json()) as { pairs?: DexPairFull[] };
      allPairs = (body.pairs ?? []).filter(
        (p) => p.chainId === DEXSCREENER_CHAIN_ID && p.baseToken?.address?.toLowerCase() === normalized
      );
    }
  } catch {
    // Detail can render from the best pair alone.
  }

  const token = rowFromPair(normalized, pairsMap.get(normalized), false);
  recordSnapshots([{ address: normalized, priceUsd: token.priceUsd }]);
  token.spark = sparkFor(normalized);

  const bestPair = token.pairAddress;
  const trades = bestPair
    ? await recentTrades(normalized, bestPair, token.priceUsd, scanSettled?.decimals ?? null)
    : [];

  return {
    token,
    pairs: allPairs
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
      .slice(0, 6)
      .map((p) => ({
        pairAddress: p.pairAddress ?? "",
        dexId: p.dexId ?? "unknown",
        quoteSymbol: p.quoteToken?.symbol ?? null,
        priceUsd: Number.isFinite(Number(p.priceUsd)) ? Number(p.priceUsd) : null,
        liquidityUsd: num(p.liquidity?.usd),
        volume24h: num(p.volume?.h24),
        url: p.url ?? null,
      })),
    scan: scanSettled,
    trades,
  };
}

/* ---------------- wallet tracker ---------------- */

export interface WalletHolding {
  token: string;
  name: string | null;
  symbol: string | null;
  amount: number;
  valueUsd: number | null;
}

export interface WalletActivityItem {
  hash: string;
  timestamp: string;
  direction: "in" | "out";
  token: string;
  symbol: string | null;
  amount: number;
  counterparty: string;
}

export interface WalletSummary {
  address: string;
  ethBalance: number | null;
  usdgBalance: number | null;
  holdings: WalletHolding[];
  activity: WalletActivityItem[];
  explorerUrl: string;
}

interface BlockscoutTokenBalance {
  token?: {
    address_hash?: string;
    address?: string;
    name?: string | null;
    symbol?: string | null;
    decimals?: string | null;
    type?: string;
    exchange_rate?: string | null;
  };
  value?: string;
}

export async function getWalletSummary(address: string): Promise<WalletSummary> {
  const normalized = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) throw new Error("A valid wallet address is required");

  const headers = { "User-Agent": "bowyer-terminal" };
  const [infoRes, balancesRes, transfersRes] = await Promise.allSettled([
    fetch(`${BLOCKSCOUT_API}/addresses/${normalized}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) }),
    fetch(`${BLOCKSCOUT_API}/addresses/${normalized}/token-balances`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) }),
    fetch(`${BLOCKSCOUT_API}/addresses/${normalized}/token-transfers?type=ERC-20`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) }),
  ]);

  let ethBalance: number | null = null;
  if (infoRes.status === "fulfilled" && infoRes.value.ok) {
    const info = (await infoRes.value.json()) as { coin_balance?: string };
    const wei = Number(info.coin_balance ?? NaN);
    if (Number.isFinite(wei)) ethBalance = wei / 1e18;
  }

  const holdings: WalletHolding[] = [];
  let usdgBalance: number | null = null;
  if (balancesRes.status === "fulfilled" && balancesRes.value.ok) {
    const balances = (await balancesRes.value.json()) as BlockscoutTokenBalance[];
    for (const entry of Array.isArray(balances) ? balances : []) {
      if (entry.token?.type && entry.token.type !== "ERC-20") continue;
      const tokenAddress = (entry.token?.address_hash ?? entry.token?.address ?? "").toLowerCase();
      if (!tokenAddress) continue;
      const decimals = Number(entry.token?.decimals ?? 18);
      const amount = Number(entry.value ?? 0) / 10 ** (Number.isFinite(decimals) ? decimals : 18);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const rate = Number(entry.token?.exchange_rate ?? NaN);
      const holding: WalletHolding = {
        token: tokenAddress,
        name: entry.token?.name ?? null,
        symbol: entry.token?.symbol ?? null,
        amount,
        valueUsd: Number.isFinite(rate) ? amount * rate : null,
      };
      if (tokenAddress === USDG) {
        usdgBalance = amount;
        holding.valueUsd = amount;
      }
      holdings.push(holding);
    }
  }
  holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const activity: WalletActivityItem[] = [];
  if (transfersRes.status === "fulfilled" && transfersRes.value.ok) {
    const body = (await transfersRes.value.json()) as { items?: BlockscoutTransfer[] };
    for (const item of (body.items ?? []).slice(0, 25)) {
      const from = (item.from?.hash ?? "").toLowerCase();
      const to = (item.to?.hash ?? "").toLowerCase();
      const direction: "in" | "out" = to === normalized ? "in" : "out";
      const decimals = Number(item.total?.decimals ?? item.token?.decimals ?? 18);
      const amount = Number(item.total?.value ?? 0) / 10 ** (Number.isFinite(decimals) ? decimals : 18);
      if (!Number.isFinite(amount)) continue;
      activity.push({
        hash: item.transaction_hash ?? "",
        timestamp: item.timestamp ?? "",
        direction,
        token: (item.token?.address_hash ?? item.token?.address ?? "").toLowerCase(),
        symbol: null,
        amount,
        counterparty: direction === "in" ? from : to,
      });
    }
  }

  return {
    address: normalized,
    ethBalance,
    usdgBalance,
    holdings: holdings.slice(0, 40),
    activity,
    explorerUrl: `${EXPLORER_BASE}/address/${normalized}`,
  };
}
