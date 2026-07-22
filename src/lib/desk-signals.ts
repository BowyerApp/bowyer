/**
 * HOOD DESK arbitrage signals.
 *
 * The quotes endpoint snapshots premium/discount into desk_premium_history.
 * Signals are derived from the latest snapshot vs recent history:
 *  - dislocation: |premium| >= threshold right now
 *  - converging / widening: gap moved meaningfully vs ~N hours ago
 */

import { db } from "@/lib/db";
import type { StockTokenQuote } from "@/lib/stock-tokens";

const isServer = typeof window === "undefined";

/** |premium| at or above this is a dislocation worth flagging. */
export const DISLOCATION_THRESHOLD_PCT = 1.0;
/** Minimum premium move (abs pct points) to call a trend. */
const TREND_DELTA_PCT = 0.35;
/** Don't record more than one snapshot per symbol within this window. */
const SNAPSHOT_MIN_INTERVAL_MS = 10 * 60 * 1000;
/** Lookback for trend comparison. */
const TREND_LOOKBACK_MS = 6 * 60 * 60 * 1000;

export interface DeskSignal {
  symbol: string;
  premiumPct: number;
  side: "premium" | "discount";
  severity: "watch" | "dislocation";
  trend: "converging" | "widening" | "flat" | "new";
  premiumPct6hAgo: number | null;
  dexPriceUsd: number | null;
  referencePriceUsd: number | null;
  at: string;
}

export interface PremiumPoint {
  premiumPct: number | null;
  at: string;
}

interface HistoryRow {
  symbol: string;
  dex_price_usd: number | null;
  reference_price_usd: number | null;
  premium_pct: number | null;
  at: string;
}

/** Persist one snapshot per symbol, throttled so polling the API doesn't spam rows. */
export function recordQuoteSnapshots(quotes: StockTokenQuote[]): number {
  if (!isServer) return 0;
  const d = db();
  const cutoff = new Date(Date.now() - SNAPSHOT_MIN_INTERVAL_MS).toISOString();
  const insert = d.prepare(
    `INSERT INTO desk_premium_history (symbol, dex_price_usd, reference_price_usd, premium_pct, at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const lastAt = d.prepare(
    "SELECT at FROM desk_premium_history WHERE symbol = ? ORDER BY at DESC LIMIT 1"
  );
  let written = 0;
  for (const q of quotes) {
    if (q.premiumDiscountPct == null) continue;
    const last = lastAt.get(q.symbol) as { at: string } | undefined;
    if (last && last.at > cutoff) continue;
    insert.run(
      q.symbol,
      q.dexPriceUsd,
      q.referencePriceUsd,
      q.premiumDiscountPct,
      new Date().toISOString()
    );
    written += 1;
  }
  return written;
}

/** Recent premium history for one symbol (for sparklines / context). */
export function getPremiumHistory(symbol: string, hours = 48): PremiumPoint[] {
  if (!isServer) return [];
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const rows = db()
    .prepare(
      `SELECT premium_pct, at FROM desk_premium_history
       WHERE symbol = ? AND at >= ? ORDER BY at ASC`
    )
    .all(symbol, since) as { premium_pct: number | null; at: string }[];
  return rows.map((r) => ({ premiumPct: r.premium_pct, at: r.at }));
}

function latestSnapshotPerSymbol(): HistoryRow[] {
  return db()
    .prepare(
      `SELECT h.* FROM desk_premium_history h
       JOIN (
         SELECT symbol, MAX(at) AS max_at FROM desk_premium_history GROUP BY symbol
       ) m ON m.symbol = h.symbol AND m.max_at = h.at`
    )
    .all() as HistoryRow[];
}

function snapshotNear(symbol: string, targetIso: string): HistoryRow | null {
  const row = db()
    .prepare(
      `SELECT * FROM desk_premium_history
       WHERE symbol = ? AND at <= ? ORDER BY at DESC LIMIT 1`
    )
    .get(symbol, targetIso) as HistoryRow | undefined;
  return row ?? null;
}

/**
 * Active signals across the board. `watch` from 0.5%, `dislocation` from the
 * threshold. Trend compares against the snapshot closest to ~6h ago.
 */
export function getDeskSignals(): DeskSignal[] {
  if (!isServer) return [];
  const lookbackIso = new Date(Date.now() - TREND_LOOKBACK_MS).toISOString();
  const signals: DeskSignal[] = [];

  for (const row of latestSnapshotPerSymbol()) {
    const premium = row.premium_pct;
    if (premium == null || !Number.isFinite(premium)) continue;
    const abs = Math.abs(premium);
    if (abs < DISLOCATION_THRESHOLD_PCT / 2) continue;

    const prior = snapshotNear(row.symbol, lookbackIso);
    const priorPremium =
      prior && prior.at !== row.at && prior.premium_pct != null ? prior.premium_pct : null;

    let trend: DeskSignal["trend"] = "new";
    if (priorPremium != null) {
      const delta = abs - Math.abs(priorPremium);
      trend = delta <= -TREND_DELTA_PCT ? "converging" : delta >= TREND_DELTA_PCT ? "widening" : "flat";
    }

    signals.push({
      symbol: row.symbol,
      premiumPct: premium,
      side: premium >= 0 ? "premium" : "discount",
      severity: abs >= DISLOCATION_THRESHOLD_PCT ? "dislocation" : "watch",
      trend,
      premiumPct6hAgo: priorPremium,
      dexPriceUsd: row.dex_price_usd,
      referencePriceUsd: row.reference_price_usd,
      at: row.at,
    });
  }

  return signals.sort((a, b) => Math.abs(b.premiumPct) - Math.abs(a.premiumPct));
}
