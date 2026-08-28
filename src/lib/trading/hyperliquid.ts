/**
 * Hyperliquid venue for trading agents.
 *
 * Market data comes from the public info API (perp universe + asset
 * contexts). Live execution places aggressive IOC limit orders (market-like,
 * 1% slippage buffer) signed by the agent's dedicated wallet — the same key
 * that trades Robinhood Chain. Long-only, cross margin, default leverage:
 * position risk stays with the mechanical caps, not with margin multipliers.
 *
 * Paper mode reuses the engine's virtual-fill path against live HL prices.
 */

import type { LocalAccount } from "viem/accounts";
import type { ScreenerToken } from "@/lib/market-data";

export const HL_ADDRESS_PREFIX = "hl:";

/**
 * The SDK requires Node >= 22 (global WebSocket at import time), so it is
 * loaded lazily and kept out of the webpack bundle (serverExternalPackages).
 */
async function sdk() {
  const mod = await import("@nktkas/hyperliquid");
  const transport = new mod.HttpTransport();
  return {
    info: new mod.InfoClient({ transport }),
    ExchangeClient: mod.ExchangeClient,
    transport,
  };
}

interface HlAsset {
  index: number;
  symbol: string;
  szDecimals: number;
  maxLeverage: number;
}

let metaCache: { assets: HlAsset[]; at: number } | null = null;

async function hlMeta(): Promise<HlAsset[]> {
  if (metaCache && Date.now() - metaCache.at < 10 * 60 * 1000) return metaCache.assets;
  const { info } = await sdk();
  const meta = await info.meta();
  const assets = meta.universe.map((u, index) => ({
    index,
    symbol: u.name,
    szDecimals: u.szDecimals,
    maxLeverage: u.maxLeverage,
  }));
  metaCache = { assets, at: Date.now() };
  return assets;
}

export function isHlToken(address: string): boolean {
  return address.startsWith(HL_ADDRESS_PREFIX);
}

export function hlSymbolFromAddress(address: string): string {
  return address.slice(HL_ADDRESS_PREFIX.length).toUpperCase();
}

/**
 * Hyperliquid perp universe shaped as ScreenerTokens so the strategies,
 * analyst prompt, and paper execution work unchanged. Top perps by 24h
 * notional volume; open interest stands in for pool liquidity.
 *
 * Cached for 45s (agents tick more often than prices meaningfully move) and
 * served stale for up to 15 minutes when the info API rate-limits our IP —
 * Railway sits behind a shared egress that CloudFront 429s under load.
 */
const SCREENER_FRESH_MS = 45_000;
const SCREENER_STALE_MS = 15 * 60_000;
let screenerCache: { rows: ScreenerToken[]; at: number } | null = null;
let screenerInflight: Promise<ScreenerToken[]> | null = null;

export async function hlScreener(limit = 25): Promise<ScreenerToken[]> {
  const now = Date.now();
  if (screenerCache && now - screenerCache.at < SCREENER_FRESH_MS) {
    return screenerCache.rows.slice(0, limit);
  }
  if (!screenerInflight) {
    screenerInflight = fetchScreener().finally(() => {
      screenerInflight = null;
    });
  }
  try {
    const rows = await screenerInflight;
    screenerCache = { rows, at: Date.now() };
    return rows.slice(0, limit);
  } catch (err) {
    if (screenerCache && now - screenerCache.at < SCREENER_STALE_MS) {
      return screenerCache.rows.slice(0, limit);
    }
    throw err;
  }
}

async function fetchScreener(): Promise<ScreenerToken[]> {
  const { info } = await sdk();
  const [meta, ctxs] = await info.metaAndAssetCtxs();
  const rows: ScreenerToken[] = [];
  for (let i = 0; i < meta.universe.length; i++) {
    const u = meta.universe[i];
    const c = ctxs[i];
    if (!c) continue;
    const price = Number(c.markPx);
    const prevDay = Number(c.prevDayPx);
    const volume24h = Number(c.dayNtlVlm);
    const openInterestUsd = Number(c.openInterest) * price;
    if (!Number.isFinite(price) || price <= 0) continue;
    rows.push({
      address: `${HL_ADDRESS_PREFIX}${u.name.toLowerCase()}`,
      name: `${u.name} Perpetual`,
      symbol: u.name,
      imageUrl: null,
      priceUsd: price,
      change5m: null,
      change1h: null,
      change24h: prevDay > 0 ? ((price - prevDay) / prevDay) * 100 : null,
      mcap: null,
      liquidityUsd: Number.isFinite(openInterestUsd) ? openInterestUsd : null,
      volume24h: Number.isFinite(volume24h) ? volume24h : null,
      buys24h: null,
      sells24h: null,
      holders: null,
      ageMinutes: null,
      pairAddress: null,
      dexId: "hyperliquid",
      dexUrl: `https://app.hyperliquid.xyz/trade/${u.name}`,
      website: null,
      twitter: null,
      explorerUrl: `https://app.hyperliquid.xyz/trade/${u.name}`,
      agent: null,
      riskLevel: null,
      riskScore: null,
      top10Pct: null,
      riskFlags: [],
      spark: [],
      fresh: false,
      kind: "meme",
    });
  }
  return rows.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
}

/**
 * Perp account equity (USDC margin) for an agent wallet on Hyperliquid.
 * Cached for 60s per address to keep leaderboard/status reads off the
 * rate-limited info API.
 */
const accountValueCache = new Map<string, { value: number; at: number }>();

export async function hlAccountValueUsd(address: string): Promise<number> {
  const key = address.toLowerCase();
  const cached = accountValueCache.get(key);
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  try {
    const { info } = await sdk();
    const state = await info.clearinghouseState({ user: address as `0x${string}` });
    const value = Number(state.marginSummary.accountValue) || 0;
    accountValueCache.set(key, { value, at: Date.now() });
    return value;
  } catch (err) {
    if (cached) return cached.value;
    throw err;
  }
}

function roundSize(size: number, szDecimals: number): string {
  const factor = 10 ** szDecimals;
  return (Math.floor(size * factor) / factor).toFixed(szDecimals);
}

function roundPrice(px: number): string {
  // Hyperliquid allows max 5 significant figures for perp prices.
  return Number(px.toPrecision(5)).toString();
}

/**
 * Market-like order: aggressive IOC limit at ±1% from mark. Buys open/add to
 * a long; sells are reduce-only so the agent can never flip net short.
 */
export async function hlPlaceOrder(input: {
  account: LocalAccount;
  symbol: string;
  isBuy: boolean;
  sizeUsd?: number;
  sizeAsset?: number;
  reduceOnly?: boolean;
}): Promise<{ txHash: string; filledQty: number; avgPriceUsd: number }> {
  const assets = await hlMeta();
  const asset = assets.find((a) => a.symbol.toUpperCase() === input.symbol.toUpperCase());
  if (!asset) throw new Error(`unknown Hyperliquid asset: ${input.symbol}`);

  const { info, ExchangeClient, transport } = await sdk();
  const mids = await info.allMids();
  const mid = Number(mids[asset.symbol]);
  if (!Number.isFinite(mid) || mid <= 0) throw new Error(`no mid price for ${asset.symbol}`);

  const size = input.sizeAsset ?? (input.sizeUsd ?? 0) / mid;
  const sizeStr = roundSize(size, asset.szDecimals);
  if (Number(sizeStr) <= 0) throw new Error("order size rounds to zero — increase clip or pick a cheaper asset");

  const limitPx = roundPrice(input.isBuy ? mid * 1.01 : mid * 0.99);

  const exchange = new ExchangeClient({ transport, wallet: input.account });

  const result = await exchange.order({
    orders: [
      {
        a: asset.index,
        b: input.isBuy,
        p: limitPx,
        s: sizeStr,
        r: input.reduceOnly ?? false,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
  });

  const status = result.response.data.statuses[0];
  if (status && typeof status === "object" && "error" in status) {
    throw new Error(`hyperliquid: ${status.error}`);
  }
  const filled =
    status && typeof status === "object" && "filled" in status ? status.filled : null;
  if (!filled) throw new Error("hyperliquid: order not filled (IOC expired)");

  return {
    txHash: `hl:${filled.oid}`,
    filledQty: Number(filled.totalSz),
    avgPriceUsd: Number(filled.avgPx),
  };
}
