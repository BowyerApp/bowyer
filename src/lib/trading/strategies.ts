/**
 * Strategy brains. Pure functions: market snapshot in, orders out.
 *
 * Shared safety rails (enforced here and re-checked by the engine):
 * - Never touch tokens whose agent audit failed.
 * - Liquidity and volume floors per strategy.
 * - Position and daily-trade caps from the instance config.
 * - Every order carries a human-readable reason that is stored on the fill.
 */

import type { ScreenerToken } from "@/lib/market-data";
import type { PositionRow, StrategyConfig, StrategyId, TradingAgentRow } from "@/lib/trading/store";
import { signalAnalyst } from "@/lib/trading/analyst";

export interface StrategyInput {
  agent: TradingAgentRow;
  tokens: ScreenerToken[];
  positions: PositionRow[];
  cashUsd: number;
  fillsToday: number;
}

export interface Order {
  side: "buy" | "sell";
  token: string;
  symbol: string;
  /** Buy size in USD (buys) — engine converts to qty at execution price. */
  usd?: number;
  /** Fraction of the position to close (sells), 0..1. */
  fraction?: number;
  priceUsd: number;
  reason: string;
  /** Optional grid bookkeeping persisted on the position. */
  meta?: Record<string, unknown>;
}

const STABLE_SYMBOLS = new Set(["USDG", "USDC", "USDT", "USDE", "DAI", "WETH", "ETH"]);

export function tradeable(t: ScreenerToken, cfg: StrategyConfig): boolean {
  return (
    t.kind === "meme" &&
    t.agent !== "failed" &&
    t.priceUsd !== null &&
    t.priceUsd > 0 &&
    (t.liquidityUsd ?? 0) >= cfg.minLiquidityUsd &&
    !STABLE_SYMBOLS.has(t.symbol.toUpperCase())
  );
}

function positionValue(p: PositionRow, price: number): number {
  return p.qty * price;
}

function buySize(cfg: StrategyConfig, cashUsd: number, currentValue: number): number {
  const room = cfg.maxPositionUsd - currentValue;
  return Math.min(cfg.clipUsd, room, cashUsd);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/* ---------------- exits shared by entry strategies ---------------- */

export function stopAndTrailExits(
  input: StrategyInput,
  opts: {
    trailPct?: number;
    takeProfitPct?: number;
    maxHoldHours?: number;
    /** Override the config stop — used by the adaptive risk engine. */
    stopLossPct?: number;
    /** Once up this much from entry, never let the trade go red again. */
    breakevenAfterPct?: number;
  }
): Order[] {
  const { positions, tokens, agent } = input;
  const orders: Order[] = [];
  const bySymbol = new Map(tokens.map((t) => [t.address.toLowerCase(), t]));
  for (const pos of positions) {
    const t = bySymbol.get(pos.token);
    const price = t?.priceUsd ?? null;
    if (!price) continue;
    const fromAvg = (price - pos.avgCostUsd) / pos.avgCostUsd;
    const fromHigh = (price - pos.highWaterUsd) / pos.highWaterUsd;
    const heldHours = (Date.now() - new Date(pos.openedAt + "Z").getTime()) / 3_600_000;

    if (fromAvg <= -(opts.stopLossPct ?? agent.config.stopLossPct)) {
      orders.push({
        side: "sell",
        token: pos.token,
        symbol: pos.symbol,
        fraction: 1,
        priceUsd: price,
        reason: `stop-loss ${(fromAvg * 100).toFixed(1)}% from entry`,
      });
      continue;
    }
    if (
      opts.breakevenAfterPct !== undefined &&
      pos.highWaterUsd >= pos.avgCostUsd * (1 + opts.breakevenAfterPct) &&
      fromAvg <= 0
    ) {
      orders.push({
        side: "sell",
        token: pos.token,
        symbol: pos.symbol,
        fraction: 1,
        priceUsd: price,
        reason: `breakeven stop — was +${(((pos.highWaterUsd - pos.avgCostUsd) / pos.avgCostUsd) * 100).toFixed(1)}%, refusing to go red`,
      });
      continue;
    }
    if (opts.trailPct !== undefined && fromHigh <= -opts.trailPct && fromAvg > 0) {
      orders.push({
        side: "sell",
        token: pos.token,
        symbol: pos.symbol,
        fraction: 1,
        priceUsd: price,
        reason: `trailing stop, +${(fromAvg * 100).toFixed(1)}% locked from high`,
      });
      continue;
    }
    if (opts.takeProfitPct !== undefined && fromAvg >= opts.takeProfitPct) {
      orders.push({
        side: "sell",
        token: pos.token,
        symbol: pos.symbol,
        fraction: 1,
        priceUsd: price,
        reason: `target hit +${(fromAvg * 100).toFixed(1)}%`,
      });
      continue;
    }
    if (opts.maxHoldHours !== undefined && heldHours >= opts.maxHoldHours) {
      orders.push({
        side: "sell",
        token: pos.token,
        symbol: pos.symbol,
        fraction: 1,
        priceUsd: price,
        reason: `time stop after ${Math.round(heldHours)}h (${fromAvg >= 0 ? "+" : ""}${(fromAvg * 100).toFixed(1)}%)`,
      });
    }
  }
  return orders;
}

/* ---------------- strategies ---------------- */

function momentumSniper(input: StrategyInput): Order[] {
  const { tokens, positions, cashUsd, agent } = input;
  const cfg = agent.config;
  const orders = stopAndTrailExits(input, { trailPct: 0.08, maxHoldHours: 48 });
  const held = new Set(positions.map((p) => p.token));

  if (positions.length < cfg.maxOpenPositions) {
    const candidates = tokens
      .filter(
        (t) =>
          tradeable(t, cfg) &&
          !held.has(t.address.toLowerCase()) &&
          (t.ageMinutes ?? Infinity) <= 24 * 60 &&
          (t.change1h ?? 0) >= 8 &&
          (t.volume24h ?? 0) >= 5_000 &&
          (t.buys24h ?? 0) > (t.sells24h ?? 0)
      )
      .sort(
        (a, b) =>
          (b.change1h ?? 0) * Math.log10((b.volume24h ?? 0) + 10) -
          (a.change1h ?? 0) * Math.log10((a.volume24h ?? 0) + 10)
      );
    const pick = candidates[0];
    if (pick) {
      const usd = buySize(cfg, cashUsd, 0);
      if (usd >= 10) {
        orders.push({
          side: "buy",
          token: pick.address.toLowerCase(),
          symbol: pick.symbol,
          usd,
          priceUsd: pick.priceUsd!,
          reason: `breakout: +${pick.change1h?.toFixed(1)}% 1h, $${Math.round((pick.volume24h ?? 0) / 1000)}k vol, ${pick.buys24h}/${pick.sells24h} buys/sells`,
        });
      }
    }
  }
  return orders;
}

function waveRider(input: StrategyInput): Order[] {
  const { tokens, positions, cashUsd, agent } = input;
  const cfg = agent.config;
  const orders: Order[] = [];
  const held = new Map(positions.map((p) => [p.token, p]));

  const universe = tokens
    .filter((t) => tradeable(t, cfg) && t.spark.length >= 12)
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
    .slice(0, 8);

  for (const t of universe) {
    const short = mean(t.spark.slice(-4));
    const long = mean(t.spark.slice(-12));
    if (short === 0 || long === 0) continue;
    const pos = held.get(t.address.toLowerCase());
    const price = t.priceUsd!;

    if (!pos && positions.length + orders.filter((o) => o.side === "buy").length < cfg.maxOpenPositions) {
      const rising = t.spark[t.spark.length - 1] >= t.spark[t.spark.length - 2];
      if (short > long * 1.01 && rising && (t.change1h ?? 0) > 0) {
        const usd = buySize(cfg, cashUsd, 0);
        if (usd >= 10) {
          orders.push({
            side: "buy",
            token: t.address.toLowerCase(),
            symbol: t.symbol,
            usd,
            priceUsd: price,
            reason: `MA cross up (${((short / long - 1) * 100).toFixed(2)}% spread), trend rising`,
          });
        }
      }
    } else if (pos) {
      const fromAvg = (price - pos.avgCostUsd) / pos.avgCostUsd;
      if (short < long * 0.995) {
        orders.push({
          side: "sell",
          token: pos.token,
          symbol: pos.symbol,
          fraction: 1,
          priceUsd: price,
          reason: `MA cross down (${fromAvg >= 0 ? "+" : ""}${(fromAvg * 100).toFixed(1)}% on trade)`,
        });
      } else if (fromAvg <= -cfg.stopLossPct) {
        orders.push({
          side: "sell",
          token: pos.token,
          symbol: pos.symbol,
          fraction: 1,
          priceUsd: price,
          reason: `stop-loss ${(fromAvg * 100).toFixed(1)}% from entry`,
        });
      }
    }
  }
  return orders;
}

interface GridMeta {
  anchor: number;
  level: number; // net grid inventory in clip units, -3..+3
  setAt: string;
}

function gridMaker(input: StrategyInput): Order[] {
  const { tokens, positions, cashUsd, agent } = input;
  const cfg = agent.config;
  const STEP = 0.02;
  const MAX_LEVEL = 3;

  // Grid runs on the single deepest tradeable pool.
  const target = tokens
    .filter((t) => tradeable(t, cfg))
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0];
  if (!target) return [];
  const price = target.priceUsd!;
  const pos = positions.find((p) => p.token === target.address.toLowerCase());
  const meta = (pos?.meta ?? {}) as Partial<GridMeta>;
  const dayOld = meta.setAt ? Date.now() - new Date(meta.setAt).getTime() > 86_400_000 : true;
  const anchor = !meta.anchor || dayOld ? price : meta.anchor;
  const level = !meta.anchor || dayOld ? 0 : (meta.level ?? 0);
  const nextMeta: GridMeta = { anchor, level, setAt: dayOld ? new Date().toISOString() : meta.setAt! };

  const drop = (price - anchor) / anchor;

  // Price fell to the next unfilled buy rung.
  if (level < MAX_LEVEL && drop <= -STEP * (level + 1)) {
    const usd = buySize(cfg, cashUsd, pos ? positionValue(pos, price) : 0);
    if (usd >= 10) {
      return [
        {
          side: "buy",
          token: target.address.toLowerCase(),
          symbol: target.symbol,
          usd,
          priceUsd: price,
          reason: `grid buy rung ${level + 1} (${(drop * 100).toFixed(1)}% below anchor)`,
          meta: { ...nextMeta, level: level + 1 },
        },
      ];
    }
  }

  // Price rose a rung above anchor while holding inventory — sell a clip.
  if (pos && pos.qty > 0 && level > -MAX_LEVEL && drop >= STEP) {
    const clipQty = Math.min(pos.qty, cfg.clipUsd / price);
    if (clipQty * price >= 10) {
      return [
        {
          side: "sell",
          token: pos.token,
          symbol: pos.symbol,
          fraction: clipQty / pos.qty,
          priceUsd: price,
          reason: `grid sell rung (+${(drop * 100).toFixed(1)}% above anchor)`,
          meta: { ...nextMeta, anchor: price, level: level - 1 },
        },
      ];
    }
  }
  return [];
}

function dipHunter(input: StrategyInput): Order[] {
  const { tokens, positions, cashUsd, agent } = input;
  const cfg = agent.config;
  const orders = stopAndTrailExits(input, { takeProfitPct: 0.1, maxHoldHours: 24 });
  const held = new Set(positions.map((p) => p.token));

  if (positions.length < cfg.maxOpenPositions) {
    const candidates = tokens
      .filter(
        (t) =>
          tradeable(t, cfg) &&
          !held.has(t.address.toLowerCase()) &&
          (t.change1h ?? 0) <= -15 &&
          (t.change24h ?? 0) > -60 && // avoid full rugs
          (t.volume24h ?? 0) >= 10_000 &&
          (t.agent === "passed" || (t.liquidityUsd ?? 0) >= 50_000)
      )
      .sort((a, b) => (a.change1h ?? 0) - (b.change1h ?? 0));
    const pick = candidates[0];
    if (pick) {
      const usd = buySize(cfg, cashUsd, 0);
      if (usd >= 10) {
        orders.push({
          side: "buy",
          token: pick.address.toLowerCase(),
          symbol: pick.symbol,
          usd,
          priceUsd: pick.priceUsd!,
          reason: `dip entry ${pick.change1h?.toFixed(1)}% 1h on $${Math.round((pick.liquidityUsd ?? 0) / 1000)}k liquidity`,
        });
      }
    }
  }
  return orders;
}

export const STRATEGIES: Record<
  StrategyId,
  (input: StrategyInput) => Order[] | Promise<Order[]>
> = {
  "momentum-sniper": momentumSniper,
  "wave-rider": waveRider,
  "grid-maker": gridMaker,
  "dip-hunter": dipHunter,
  "signal-analyst": signalAnalyst,
};
