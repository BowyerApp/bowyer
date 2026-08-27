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
