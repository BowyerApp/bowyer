/**
 * Adaptive risk engine.
 *
 * The rails are no longer static: every decision cycle the agent's own track
 * record — realized win rate, average exit PnL, current streak, and equity
 * drawdown — expands or contracts its risk budget. Earn performance, get more
 * rope; bleed, get less. Anti-martingale by construction: losses always
 * shrink size, never grow it.
 *
 * Adaptation happens inside a fixed outer envelope (never more than 2x the
 * configured base size, stops never looser than 30%), so a hot streak or a
 * hallucinating model still can't blow up the wallet.
 */

import { equitySeries, memoriesFor, type StrategyConfig } from "@/lib/trading/store";
import { db } from "@/lib/db";

export interface RiskProfile {
  clipUsd: number;
  maxPositionUsd: number;
  maxOpenPositions: number;
  stopLossPct: number;
  trailPct: number;
  /** Overall multiplier applied to base size, for display. */
  sizeMult: number;
  /** Human-readable explanation, fed to the LLM and the decision trail. */
  rationale: string;
}

const BASE_TRAIL_PCT = 0.12;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Parse realized exits out of the agent's memory stream (newest first). */
function realizedExits(agentId: string, limit: number): number[] {
  const out: number[] = [];
  for (const m of memoriesFor(agentId, limit)) {
    const match = /^(WIN|LOSS) \S+ ([+-]?[\d.]+)%/.exec(m.lesson);
    if (match) out.push(Number(match[2]));
  }
  return out;
}

export function adaptiveRisk(agentId: string, cfg: StrategyConfig): RiskProfile {
  const exits = realizedExits(agentId, 20);
  const trades = exits.length;

  // Performance score in [-1, 1] from win rate and average realized PnL,
  // weighted down when the sample is small so a fresh agent trades at 1x.
  let score = 0;
  let winRate = 0;
  let avgPnl = 0;
  if (trades > 0) {
    const wins = exits.filter((p) => p >= 0).length;
    winRate = wins / trades;
    avgPnl = exits.reduce((a, b) => a + b, 0) / trades;
    const confidence = Math.min(1, trades / 10);
    score = clamp((winRate - 0.5) * 2 + avgPnl / 10, -1, 1) * confidence;
  }

  // Streak: consecutive same-sign exits, newest first.
  let streak = 0;
  for (const p of exits) {
    const sign = p >= 0 ? 1 : -1;
    if (streak === 0) streak = sign;
    else if (Math.sign(streak) === sign) streak += sign;
    else break;
  }

  // Drawdown from peak equity over the recent series.
  const series = equitySeries(agentId, 100);
  let drawdown = 0;
  if (series.length > 1) {
    const peak = Math.max(...series.map((s) => s.equityUsd));
    const last = series[series.length - 1].equityUsd;
    if (peak > 0) drawdown = Math.max(0, (peak - last) / peak);
  }

  // Size multiplier: performance earns rope, streaks nudge it, drawdown cuts
  // it hard. Bounded to [0.3x, 2x] of the configured base — the envelope.
  let sizeMult = 1 + 0.6 * score;
  if (streak >= 3) sizeMult *= 1.15;
  if (streak <= -2) sizeMult *= 0.6;
  if (drawdown > 0.2) sizeMult *= 0.4;
  else if (drawdown > 0.1) sizeMult *= 0.6;
  sizeMult = clamp(sizeMult, 0.3, 2);

  // Stops tighten when the agent is losing, breathe when it has earned it.
  const stopScale = streak <= -2 || drawdown > 0.1 ? 0.7 : score > 0.3 ? 1.2 : 1;
  const stopLossPct = clamp(cfg.stopLossPct * stopScale, 0.03, 0.3);

  // Trail: let winners run on a hot hand, lock gains fast on a cold one.
  const trailPct =
    score > 0.3 && streak >= 2
      ? clamp(BASE_TRAIL_PCT * 1.3, 0.05, 0.2)
      : streak <= -2
        ? clamp(BASE_TRAIL_PCT * 0.6, 0.05, 0.2)
        : BASE_TRAIL_PCT;

  // Position count unlocks with a proven sample, locks down when bleeding.
  let maxOpenPositions = cfg.maxOpenPositions;
  if (trades >= 10 && score > 0.4) maxOpenPositions = Math.min(cfg.maxOpenPositions + 1, 6);
  if (score < -0.3 || drawdown > 0.15) maxOpenPositions = Math.max(1, cfg.maxOpenPositions - 1);

  const parts = [
    trades === 0
      ? "no realized trades yet, base budget"
      : `${trades} exits, ${(winRate * 100).toFixed(0)}% wins, avg ${avgPnl >= 0 ? "+" : ""}${avgPnl.toFixed(1)}%`,
    streak !== 0 ? `streak ${streak > 0 ? "+" : ""}${streak}` : "",
    drawdown > 0.02 ? `drawdown ${(drawdown * 100).toFixed(0)}%` : "",
  ].filter(Boolean);

  return {
    clipUsd: Math.max(10, Math.round(cfg.clipUsd * sizeMult)),
    maxPositionUsd: Math.max(20, Math.round(cfg.maxPositionUsd * sizeMult)),
    maxOpenPositions,
    stopLossPct,
    trailPct,
    sizeMult,
    rationale: `risk budget ${sizeMult.toFixed(2)}x (${parts.join(", ")}) — stop ${(stopLossPct * 100).toFixed(1)}%, trail ${(trailPct * 100).toFixed(0)}%`,
  };
}

/* ---------------- protections (freqtrade-style) ---------------- */

export interface Protections {
  /** Non-null reason string when ALL new entries are blocked. */
  entriesHalted: string | null;
  /** Token addresses locked from re-entry (cooldown after a recent exit). */
  cooldownTokens: Set<string>;
  /** Human-readable summary for the LLM prompt and decision trail. */
  summary: string;
}

/** Full cooldown only after a stop-loss — that's the revenge-buy pattern. */
const STOP_COOLDOWN_HOURS = 4;
/**
 * Ordinary exits (trims into strength, rotations) get a short anti-churn
 * lock only: re-entering a name that keeps trending is a legitimate momentum
 * pattern, and a long lock just makes a scalper sit out its best tape.
 */
const EXIT_COOLDOWN_MINUTES = 30;
const STOPLOSS_GUARD_LIMIT = 3; // stop-losses in the lookback window …
const STOPLOSS_GUARD_LOOKBACK_HOURS = 24; // … halts entries
// Owner-selected outer boundary for the aggressive growth mandate. Adaptive
// sizing already cuts risk hard beyond 20%; at 25% no new exposure is allowed.
const DRAWDOWN_HALT = 0.25;

/**
 * Freqtrade-style protections, adapted:
 * - CooldownPeriod: a token that was just sold is locked for a few hours, so
 *   the agent can't revenge-buy the thing that just stopped it out.
 * - StoplossGuard: several stop-losses within a day means the market regime
 *   is hostile — stop opening new positions until it passes.
 * - MaxDrawdown halt: beyond the sizing cuts, a deep equity drawdown blocks
 *   all new entries entirely. Exits always remain allowed.
 */
export function protections(agentId: string): Protections {
  const cooldownTokens = new Set<string>();
  const cooldownSymbols: string[] = [];
  const recentSells = db()
    .prepare(
      `SELECT token, symbol, MAX(at) AS last_sell,
              MAX(CASE WHEN reason LIKE 'stop-loss%' THEN 1 ELSE 0 END) AS was_stop
       FROM trading_fills
       WHERE agent_id = ? AND side = 'sell' AND at >= datetime('now', ?)
       GROUP BY token`
    )
    .all(agentId, `-${STOP_COOLDOWN_HOURS} hours`) as {
    token: string;
    symbol: string;
    last_sell: string;
    was_stop: number;
  }[];
  for (const r of recentSells) {
    const lockMs = r.was_stop
      ? STOP_COOLDOWN_HOURS * 3_600_000
      : EXIT_COOLDOWN_MINUTES * 60_000;
    const soldAt = new Date(`${r.last_sell.replace(" ", "T")}Z`).getTime();
    if (Number.isFinite(soldAt) && Date.now() - soldAt < lockMs) {
      cooldownTokens.add(r.token.toLowerCase());
      cooldownSymbols.push(`${r.symbol}${r.was_stop ? " (stopped)" : ""}`);
    }
  }

  let entriesHalted: string | null = null;

  const stops = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM trading_fills
       WHERE agent_id = ? AND side = 'sell' AND reason LIKE 'stop-loss%'
       AND at >= datetime('now', ?)`
    )
    .get(agentId, `-${STOPLOSS_GUARD_LOOKBACK_HOURS} hours`) as { n: number };
  if (stops.n >= STOPLOSS_GUARD_LIMIT) {
    entriesHalted = `stoploss guard: ${stops.n} stop-losses in ${STOPLOSS_GUARD_LOOKBACK_HOURS}h — market regime is hostile, entries paused`;
  }

  if (!entriesHalted) {
    const series = equitySeries(agentId, 100);
    if (series.length > 1) {
      const peak = Math.max(...series.map((s) => s.equityUsd));
      const last = series[series.length - 1].equityUsd;
      const dd = peak > 0 ? (peak - last) / peak : 0;
      if (dd > DRAWDOWN_HALT) {
        entriesHalted = `max drawdown halt: ${(dd * 100).toFixed(0)}% off peak equity — entries paused until recovery`;
      }
    }
  }

  const bits = [
    entriesHalted ? `ENTRIES HALTED (${entriesHalted})` : "",
    cooldownTokens.size > 0
      ? `on post-exit cooldown, do NOT propose buying: ${cooldownSymbols.join(", ")}`
      : "",
  ].filter(Boolean);

  return {
    entriesHalted,
    cooldownTokens,
    summary: bits.length > 0 ? bits.join("; ") : "none active",
  };
}

/* ---------------- per-order sizing caps ---------------- */

/**
 * Final per-buy size cap combining three sizing disciplines from the
 * open-source playbook:
 * - risk-per-trade: size × stop distance ≤ ~1.5% of equity, so any single
 *   stopped-out trade costs a fixed, survivable fraction.
 * - volatility targeting: hotter tokens get smaller clips (|24h change| as
 *   the vol proxy), calm ones can size up slightly.
 * - market impact: never more than 0.5% of pool liquidity in one clip.
 */
export function buySizeCap(
  proposedUsd: number,
  args: { equityUsd: number; stopLossPct: number; change24hPct: number | null; liquidityUsd: number | null },
  /**
   * Soft floor: the volatility multiplier never shrinks the clip below this,
   * though the hard caps (risk-per-trade, liquidity, proposal) still apply.
   * Used for cross-chain clips whose ~fixed routing fee makes dust sizes
   * uneconomical.
   */
  floorUsd = 0
): number {
  const riskPerTrade = 0.015 * args.equityUsd;
  const byStop = args.stopLossPct > 0 ? riskPerTrade / args.stopLossPct : proposedUsd;

  const vol = Math.abs(args.change24hPct ?? 10);
  const volMult = clamp(10 / Math.max(vol, 1), 0.5, 1.5);

  const byLiquidity = args.liquidityUsd ? args.liquidityUsd * 0.005 : Infinity;

  const capped = Math.min(proposedUsd * volMult, byStop, byLiquidity);
  const floor = Math.min(floorUsd, proposedUsd, byStop, byLiquidity);
  return Math.max(capped, floor);
}
