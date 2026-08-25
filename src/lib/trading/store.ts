/**
 * Trading agents — persistence layer.
 *
 * An "agent instance" is one user's deployment of one strategy, in either
 * paper mode (virtual $1,000 bankroll, fills at live market prices) or live
 * mode (real swaps from a dedicated agent wallet).
 *
 * Every number shown in the UI is derived from rows written here at fill
 * time. There are no synthetic backtests anywhere in this system.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export type StrategyId =
  | "momentum-sniper"
  | "wave-rider"
  | "grid-maker"
  | "dip-hunter"
  | "signal-analyst";
export type AgentMode = "paper" | "live";
export type AgentStatus = "active" | "paused";

export const PAPER_START_USD = 1000;
export const MAX_INSTANCES_PER_WALLET = 4;

export interface StrategyConfig {
  /** USD size of a single entry clip. */
  clipUsd: number;
  /** Max USD deployed into a single token position. */
  maxPositionUsd: number;
  /** Max simultaneously open positions. */
  maxOpenPositions: number;
  /** Hard ceiling on fills per UTC day. */
  dailyTradeCap: number;
  /** Emergency stop-loss from average cost, e.g. 0.25 = -25%. */
  stopLossPct: number;
  /** Minimum pool liquidity for any traded token (USD). */
  minLiquidityUsd: number;
  /** signal-analyst only: the owner's mandate, injected into the LLM prompt. */
  brief?: string;
  /** signal-analyst only: knowledge sources fetched live before each decision. */
  sources?: { type: string; url: string }[];
  /** signal-analyst only: bull/bear/risk-officer debate before each decision (default on). */
  debate?: boolean;
  /** Execution venue: Robinhood Chain spot (default) or Hyperliquid perps. */
  venue?: "rhc" | "hyperliquid";
}

export interface TradingAgentRow {
  id: string;
  owner: string;
  strategy: StrategyId;
  mode: AgentMode;
  status: AgentStatus;
  config: StrategyConfig;
  walletAddress: string | null;
  createdAt: string;
  lastTickAt: string | null;
  lastNote: string | null;
}

export interface FillRow {
  id: string;
  agentId: string;
  side: "buy" | "sell";
  token: string;
  symbol: string;
  qty: number;
  priceUsd: number;
  valueUsd: number;
  txHash: string;
  reason: string;
  at: string;
}

export interface PositionRow {
  agentId: string;
  token: string;
  symbol: string;
  qty: number;
  avgCostUsd: number;
  highWaterUsd: number;
  openedAt: string;
  meta: Record<string, unknown>;
}

export const STRATEGY_DEFAULTS: Record<StrategyId, StrategyConfig> = {
  "momentum-sniper": {
    clipUsd: 60,
    maxPositionUsd: 120,
    maxOpenPositions: 3,
    dailyTradeCap: 24,
    stopLossPct: 0.2,
    minLiquidityUsd: 15_000,
  },
  "wave-rider": {
    clipUsd: 150,
    maxPositionUsd: 300,
    maxOpenPositions: 2,
    dailyTradeCap: 10,
    stopLossPct: 0.1,
    minLiquidityUsd: 50_000,
  },
  "grid-maker": {
    clipUsd: 80,
    maxPositionUsd: 400,
    maxOpenPositions: 1,
    dailyTradeCap: 40,
    stopLossPct: 0.3,
    minLiquidityUsd: 100_000,
  },
  "dip-hunter": {
    clipUsd: 100,
    maxPositionUsd: 200,
    maxOpenPositions: 2,
    dailyTradeCap: 12,
    stopLossPct: 0.25,
    minLiquidityUsd: 25_000,
  },
  "signal-analyst": {
    clipUsd: 100,
    maxPositionUsd: 250,
    maxOpenPositions: 3,
    dailyTradeCap: 8,
    stopLossPct: 0.2,
    minLiquidityUsd: 25_000,
  },
};

export const STRATEGY_META: Record<
  StrategyId,
  { name: string; style: string; blurb: string }
> = {
  "momentum-sniper": {
    name: "Momentum Sniper",
    style: "MOMENTUM",
    blurb: "Enters fresh tokens on volume breakouts with an 8% trailing stop. Exits into strength.",
  },
  "wave-rider": {
    name: "Wave Rider",
    style: "SWING",
    blurb: "Rides trends on the deepest tokens using moving-average crosses. Cuts losers fast.",
  },
  "grid-maker": {
    name: "Grid Maker",
    style: "GRID",
    blurb: "Places laddered buys and sells around price on a deep pool. Profits from chop, not direction.",
  },
  "dip-hunter": {
    name: "Dip Hunter",
    style: "MEAN REVERT",
    blurb: "Buys -15% panic moves on audited tokens with real liquidity, scales out on the bounce.",
  },
  "signal-analyst": {
    name: "Signal Analyst",
    style: "AI ANALYST",
    blurb:
      "An LLM reads your connected data — wallets, Telegram, APIs, news — plus the live market, and decides every trade. You write the mandate; hard risk caps stay mechanical.",
  },
};

function ensureTables() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS trading_agents (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      strategy TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      config_json TEXT NOT NULL,
      wallet_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_tick_at TEXT,
      last_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trading_agents_owner ON trading_agents (owner);
    CREATE TABLE IF NOT EXISTS trading_wallets (
      agent_id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      address TEXT NOT NULL,
      key_ciphertext TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS trading_fills (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      side TEXT NOT NULL,
      token TEXT NOT NULL,
      symbol TEXT NOT NULL,
      qty REAL NOT NULL,
      price_usd REAL NOT NULL,
      value_usd REAL NOT NULL,
      tx_hash TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trading_fills_agent ON trading_fills (agent_id, at DESC);
    CREATE TABLE IF NOT EXISTS trading_positions (
      agent_id TEXT NOT NULL,
      token TEXT NOT NULL,
      symbol TEXT NOT NULL,
      qty REAL NOT NULL,
      avg_cost_usd REAL NOT NULL,
      high_water_usd REAL NOT NULL,
      opened_at TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (agent_id, token)
    );
    CREATE TABLE IF NOT EXISTS trading_cash (
      agent_id TEXT PRIMARY KEY,
      usd REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trading_equity (
      agent_id TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      equity_usd REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trading_equity_agent ON trading_equity (agent_id, at);
    CREATE TABLE IF NOT EXISTS trading_deposits (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS trading_memories (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      lesson TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trading_memories_agent ON trading_memories (agent_id, at DESC);
    CREATE TABLE IF NOT EXISTS trading_decisions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      orders_json TEXT NOT NULL DEFAULT '[]',
      debate_json TEXT,
      context_note TEXT NOT NULL DEFAULT '',
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trading_decisions_agent ON trading_decisions (agent_id, at DESC);
  `);
}

function rowToAgent(r: {
  id: string;
  owner: string;
  strategy: string;
  mode: string;
  status: string;
  config_json: string;
  wallet_address: string | null;
  created_at: string;
  last_tick_at: string | null;
  last_note: string | null;
}): TradingAgentRow {
  return {
    id: r.id,
    owner: r.owner,
    strategy: r.strategy as StrategyId,
    mode: r.mode as AgentMode,
    status: r.status as AgentStatus,
    config: { ...STRATEGY_DEFAULTS[r.strategy as StrategyId], ...JSON.parse(r.config_json) },
    walletAddress: r.wallet_address,
    createdAt: r.created_at,
    lastTickAt: r.last_tick_at,
    lastNote: r.last_note,
  };
}

export function createAgentInstance(input: {
  owner: string;
  strategy: StrategyId;
  mode: AgentMode;
  walletAddress?: string;
  config?: Partial<StrategyConfig>;
}): TradingAgentRow {
  ensureTables();
  const owner = input.owner.toLowerCase();
  const count = db()
    .prepare("SELECT COUNT(*) AS n FROM trading_agents WHERE owner = ?")
    .get(owner) as { n: number };
  if (count.n >= MAX_INSTANCES_PER_WALLET) {
    throw new Error(`Limit of ${MAX_INSTANCES_PER_WALLET} agents per wallet reached`);
  }
  const id = randomUUID();
  db()
    .prepare(
      `INSERT INTO trading_agents (id, owner, strategy, mode, status, config_json, wallet_address)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    )
    .run(
      id,
      owner,
      input.strategy,
      input.mode,
      JSON.stringify(input.config ?? {}),
      input.walletAddress ?? null
    );
  if (input.mode === "paper") {
    db()
      .prepare("INSERT OR REPLACE INTO trading_cash (agent_id, usd) VALUES (?, ?)")
      .run(id, PAPER_START_USD);
  }
  return getAgent(id)!;
}

export function getAgent(id: string): TradingAgentRow | null {
  ensureTables();
  const r = db().prepare("SELECT * FROM trading_agents WHERE id = ?").get(id);
  return r ? rowToAgent(r as Parameters<typeof rowToAgent>[0]) : null;
}

export function listAgentsFor(owner: string): TradingAgentRow[] {
  ensureTables();
  const rows = db()
    .prepare("SELECT * FROM trading_agents WHERE owner = ? ORDER BY created_at DESC")
    .all(owner.toLowerCase());
  return (rows as Parameters<typeof rowToAgent>[0][]).map(rowToAgent);
}

export function listActiveAgents(): TradingAgentRow[] {
  ensureTables();
  const rows = db().prepare("SELECT * FROM trading_agents WHERE status = 'active'").all();
  return (rows as Parameters<typeof rowToAgent>[0][]).map(rowToAgent);
}

export function setAgentStatus(id: string, status: AgentStatus): void {
  ensureTables();
  db().prepare("UPDATE trading_agents SET status = ? WHERE id = ?").run(status, id);
}

export function deleteAgent(id: string): void {
  ensureTables();
  const d = db();
  d.prepare("DELETE FROM trading_agents WHERE id = ?").run(id);
  d.prepare("DELETE FROM trading_positions WHERE agent_id = ?").run(id);
  d.prepare("DELETE FROM trading_cash WHERE agent_id = ?").run(id);
  // Fills, equity and wallet rows are kept — audit trail and key custody
  // must survive instance deletion so funds are always recoverable.
}

/**
 * First line of an error, truncated — viem errors embed entire upstream
 * response bodies (e.g. a Cloudflare 530 HTML page), which must never reach
 * the UI or the database whole.
 */
export function briefError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.split("\n")[0].slice(0, 240) || "Request failed";
}

export function noteTick(id: string, note: string): void {
  db()
    .prepare("UPDATE trading_agents SET last_tick_at = datetime('now'), last_note = ? WHERE id = ?")
    .run(note.slice(0, 300), id);
}

/* ---------------- cash (paper bankroll / live cash mirror) ---------------- */

export function cashFor(agentId: string): number {
  ensureTables();
  const r = db().prepare("SELECT usd FROM trading_cash WHERE agent_id = ?").get(agentId) as
    | { usd: number }
    | undefined;
  return r?.usd ?? 0;
}

export function setCash(agentId: string, usd: number): void {
  db().prepare("INSERT OR REPLACE INTO trading_cash (agent_id, usd) VALUES (?, ?)").run(agentId, usd);
}

/* ---------------- fills + positions ---------------- */

export function fillsToday(agentId: string): number {
  const r = db()
    .prepare("SELECT COUNT(*) AS n FROM trading_fills WHERE agent_id = ? AND at >= date('now')")
    .get(agentId) as { n: number };
  return r.n;
}

export function recordFill(input: {
  agentId: string;
  side: "buy" | "sell";
  token: string;
  symbol: string;
  qty: number;
  priceUsd: number;
  txHash: string;
  reason: string;
}): void {
  ensureTables();
  const valueUsd = input.qty * input.priceUsd;
  const d = db();
  d.prepare(
    `INSERT INTO trading_fills (id, agent_id, side, token, symbol, qty, price_usd, value_usd, tx_hash, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    input.agentId,
    input.side,
    input.token.toLowerCase(),
    input.symbol,
    input.qty,
    input.priceUsd,
    valueUsd,
    input.txHash,
    input.reason.slice(0, 240)
  );

  const pos = d
    .prepare("SELECT * FROM trading_positions WHERE agent_id = ? AND token = ?")
    .get(input.agentId, input.token.toLowerCase()) as
    | { qty: number; avg_cost_usd: number; high_water_usd: number; meta_json: string }
    | undefined;

  if (input.side === "buy") {
    if (pos) {
      const newQty = pos.qty + input.qty;
      const newAvg = (pos.qty * pos.avg_cost_usd + input.qty * input.priceUsd) / newQty;
      d.prepare(
        "UPDATE trading_positions SET qty = ?, avg_cost_usd = ?, high_water_usd = MAX(high_water_usd, ?) WHERE agent_id = ? AND token = ?"
      ).run(newQty, newAvg, input.priceUsd, input.agentId, input.token.toLowerCase());
    } else {
      d.prepare(
        `INSERT INTO trading_positions (agent_id, token, symbol, qty, avg_cost_usd, high_water_usd, opened_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        input.agentId,
        input.token.toLowerCase(),
        input.symbol,
        input.qty,
        input.priceUsd,
        input.priceUsd
      );
    }
  } else {
    if (pos) {
      const newQty = pos.qty - input.qty;
      if (newQty <= 1e-9) {
        d.prepare("DELETE FROM trading_positions WHERE agent_id = ? AND token = ?").run(
          input.agentId,
          input.token.toLowerCase()
        );
      } else {
        d.prepare("UPDATE trading_positions SET qty = ? WHERE agent_id = ? AND token = ?").run(
          newQty,
          input.agentId,
          input.token.toLowerCase()
        );
      }
      // Every realized exit becomes a lesson the agent can learn from.
      if (pos.avg_cost_usd > 0) {
        const pnlPct = ((input.priceUsd - pos.avg_cost_usd) / pos.avg_cost_usd) * 100;
        addMemory(
          input.agentId,
          `${pnlPct >= 0 ? "WIN" : "LOSS"} ${input.symbol} ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% (entry $${pos.avg_cost_usd.toPrecision(4)}, exit $${input.priceUsd.toPrecision(4)}) — ${input.reason.slice(0, 120)}`
        );
      }
    }
  }
}

export function positionsFor(agentId: string): PositionRow[] {
  ensureTables();
  const rows = db()
    .prepare("SELECT * FROM trading_positions WHERE agent_id = ?")
    .all(agentId) as {
    agent_id: string;
    token: string;
    symbol: string;
    qty: number;
    avg_cost_usd: number;
    high_water_usd: number;
    opened_at: string;
    meta_json: string;
  }[];
  return rows.map((r) => ({
    agentId: r.agent_id,
    token: r.token,
    symbol: r.symbol,
    qty: r.qty,
    avgCostUsd: r.avg_cost_usd,
    highWaterUsd: r.high_water_usd,
    openedAt: r.opened_at,
    meta: JSON.parse(r.meta_json || "{}"),
  }));
}

export function updateHighWater(agentId: string, token: string, priceUsd: number): void {
  db()
    .prepare(
      "UPDATE trading_positions SET high_water_usd = MAX(high_water_usd, ?) WHERE agent_id = ? AND token = ?"
    )
    .run(priceUsd, agentId, token.toLowerCase());
}

export function setPositionMeta(agentId: string, token: string, meta: Record<string, unknown>): void {
  db()
    .prepare("UPDATE trading_positions SET meta_json = ? WHERE agent_id = ? AND token = ?")
    .run(JSON.stringify(meta), agentId, token.toLowerCase());
}

export function fillsFor(agentId: string, limit = 50): FillRow[] {
  ensureTables();
  const rows = db()
    .prepare("SELECT * FROM trading_fills WHERE agent_id = ? ORDER BY at DESC LIMIT ?")
    .all(agentId, limit) as {
    id: string;
    agent_id: string;
    side: string;
    token: string;
    symbol: string;
    qty: number;
    price_usd: number;
    value_usd: number;
    tx_hash: string;
    reason: string;
    at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    side: r.side as "buy" | "sell",
    token: r.token,
    symbol: r.symbol,
    qty: r.qty,
    priceUsd: r.price_usd,
    valueUsd: r.value_usd,
    txHash: r.tx_hash,
    reason: r.reason,
    at: r.at,
  }));
}

/* ---------------- equity + program-level stats ---------------- */

export function snapshotEquity(agentId: string, equityUsd: number): void {
  ensureTables();
  db()
    .prepare("INSERT INTO trading_equity (agent_id, equity_usd) VALUES (?, ?)")
    .run(agentId, equityUsd);
  // Keep at most ~2 weeks of minute-level data per agent.
  db()
    .prepare(
      "DELETE FROM trading_equity WHERE agent_id = ? AND at < datetime('now', '-14 days')"
    )
    .run(agentId);
}

export function equitySeries(agentId: string, points = 200): { at: string; equityUsd: number }[] {
  ensureTables();
  const rows = db()
    .prepare(
      "SELECT at, equity_usd AS equityUsd FROM (SELECT at, equity_usd FROM trading_equity WHERE agent_id = ? ORDER BY at DESC LIMIT ?) ORDER BY at ASC"
    )
    .all(agentId, points) as { at: string; equityUsd: number }[];
  return rows;
}

export function recordDeposit(
  agentId: string,
  kind: "deposit" | "withdraw",
  amountUsd: number,
  txId?: string
): void {
  ensureTables();
  db()
    .prepare("INSERT OR IGNORE INTO trading_deposits (id, agent_id, kind, amount_usd) VALUES (?, ?, ?, ?)")
    .run(txId ?? randomUUID(), agentId, kind, amountUsd);
}

export function netDeposits(agentId: string): number {
  ensureTables();
  const r = db()
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN kind = 'deposit' THEN amount_usd ELSE -amount_usd END), 0) AS n FROM trading_deposits WHERE agent_id = ?"
    )
    .get(agentId) as { n: number };
  return r.n;
}

/* ---------------- agent memory (lessons that survive restarts) ---------------- */

export function addMemory(agentId: string, lesson: string): void {
  ensureTables();
  db()
    .prepare("INSERT INTO trading_memories (id, agent_id, lesson) VALUES (?, ?, ?)")
    .run(randomUUID(), agentId, lesson.slice(0, 300));
  // Keep the memory bounded — the newest 40 lessons per agent.
  db()
    .prepare(
      `DELETE FROM trading_memories WHERE agent_id = ? AND id NOT IN (
         SELECT id FROM trading_memories WHERE agent_id = ? ORDER BY at DESC LIMIT 40
       )`
    )
    .run(agentId, agentId);
}

export function memoriesFor(agentId: string, limit = 12): { lesson: string; at: string }[] {
  ensureTables();
  return db()
    .prepare("SELECT lesson, at FROM trading_memories WHERE agent_id = ? ORDER BY at DESC LIMIT ?")
    .all(agentId, limit) as { lesson: string; at: string }[];
}

/* ---------------- decision trail (every LLM decision, auditable) ---------------- */

export interface DecisionRow {
  id: string;
  agentId: string;
  reasoning: string;
  orders: { side: string; symbol: string; usd?: number; fraction?: number; reason?: string }[];
  debate: { role: string; view: string }[] | null;
  contextNote: string;
  at: string;
}

export function recordDecision(input: {
  agentId: string;
  reasoning: string;
  orders: unknown[];
  debate?: { role: string; view: string }[];
  contextNote?: string;
}): void {
  ensureTables();
  db()
    .prepare(
      `INSERT INTO trading_decisions (id, agent_id, reasoning, orders_json, debate_json, context_note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      input.agentId,
      input.reasoning.slice(0, 2000),
      JSON.stringify(input.orders),
      input.debate ? JSON.stringify(input.debate) : null,
      (input.contextNote ?? "").slice(0, 200)
    );
  db()
    .prepare(
      `DELETE FROM trading_decisions WHERE agent_id = ? AND id NOT IN (
         SELECT id FROM trading_decisions WHERE agent_id = ? ORDER BY at DESC LIMIT 100
       )`
    )
    .run(input.agentId, input.agentId);
}

export function decisionsFor(agentId: string, limit = 20): DecisionRow[] {
  ensureTables();
  const rows = db()
    .prepare("SELECT * FROM trading_decisions WHERE agent_id = ? ORDER BY at DESC LIMIT ?")
    .all(agentId, limit) as {
    id: string;
    agent_id: string;
    reasoning: string;
    orders_json: string;
    debate_json: string | null;
    context_note: string;
    at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    reasoning: r.reasoning,
    orders: JSON.parse(r.orders_json || "[]"),
    debate: r.debate_json ? JSON.parse(r.debate_json) : null,
    contextNote: r.context_note,
    at: r.at,
  }));
}

/* ---------------- public leaderboard (verified PnL, no self-reporting) ---------------- */

export interface LeaderboardRow {
  agentId: string;
  ownerShort: string;
  strategy: StrategyId;
  mode: AgentMode;
  status: AgentStatus;
  equityUsd: number;
  startUsd: number;
  pnlPct: number;
  trades: number;
  winRate: number | null;
  createdAt: string;
  /** Public wallet for live agents — every fill is verifiable on-chain. */
  walletAddress: string | null;
  venue: "hyperliquid" | "rhc";
}

export function leaderboard(limit = 50): LeaderboardRow[] {
  ensureTables();
  const agents = db()
    .prepare("SELECT * FROM trading_agents ORDER BY created_at ASC")
    .all() as Parameters<typeof rowToAgent>[0][];
  const out: LeaderboardRow[] = [];
  for (const raw of agents) {
    const a = rowToAgent(raw);
    const eq = db()
      .prepare("SELECT equity_usd FROM trading_equity WHERE agent_id = ? ORDER BY at DESC LIMIT 1")
      .get(a.id) as { equity_usd: number } | undefined;
    const trades = db()
      .prepare("SELECT COUNT(*) AS n FROM trading_fills WHERE agent_id = ?")
      .get(a.id) as { n: number };
    if (!eq && trades.n === 0) continue; // never ticked — nothing to verify
    const deposits = netDeposits(a.id);
    // Live agents without a recorded deposit have no verifiable baseline.
    if (a.mode === "live" && deposits <= 0) continue;
    const start = a.mode === "paper" ? PAPER_START_USD + deposits : deposits;
    const equity = eq?.equity_usd ?? (a.mode === "paper" ? cashFor(a.id) : 0);
    const sells = db()
      .prepare("SELECT reason FROM trading_fills WHERE agent_id = ? AND side = 'sell'")
      .all(a.id) as { reason: string }[];
    const wins = sells.filter((s) => /\+[\d.]+%/.test(s.reason)).length;
    out.push({
      agentId: a.id,
      ownerShort: `${a.owner.slice(0, 6)}…${a.owner.slice(-4)}`,
      strategy: a.strategy,
      mode: a.mode,
      status: a.status,
      equityUsd: equity,
      startUsd: start,
      pnlPct: start > 0 ? ((equity - start) / start) * 100 : 0,
      trades: trades.n,
      winRate: sells.length > 0 ? (wins / sells.length) * 100 : null,
      createdAt: a.createdAt,
      walletAddress: a.mode === "live" ? a.walletAddress ?? null : null,
      venue: a.config?.venue === "hyperliquid" ? "hyperliquid" : "rhc",
    });
  }
  return out.sort((x, y) => y.pnlPct - x.pnlPct).slice(0, limit);
}

/** Real aggregate stats per strategy across all instances — from actual fills only. */
export function strategyStats(): Record<
  string,
  { trades: number; winRate: number | null; liveSince: string | null }
> {
  ensureTables();
  const out: Record<string, { trades: number; winRate: number | null; liveSince: string | null }> = {};
  const rows = db()
    .prepare(
      `SELECT a.strategy AS strategy, COUNT(f.id) AS trades, MIN(f.at) AS since
       FROM trading_fills f JOIN trading_agents a ON a.id = f.agent_id
       GROUP BY a.strategy`
    )
    .all() as { strategy: string; trades: number; since: string | null }[];
  for (const r of rows) {
    out[r.strategy] = { trades: r.trades, winRate: null, liveSince: r.since };
  }
  // Win rate: share of sell fills above the position's average cost at exit time.
  const sells = db()
    .prepare(
      `SELECT a.strategy AS strategy, f.reason AS reason
       FROM trading_fills f JOIN trading_agents a ON a.id = f.agent_id
       WHERE f.side = 'sell'`
    )
    .all() as { strategy: string; reason: string }[];
  const byStrat: Record<string, { wins: number; total: number }> = {};
  for (const s of sells) {
    const b = (byStrat[s.strategy] ??= { wins: 0, total: 0 });
    b.total += 1;
    if (/\+[\d.]+%/.test(s.reason)) b.wins += 1;
  }
  for (const [strategy, b] of Object.entries(byStrat)) {
    if (out[strategy] && b.total > 0) out[strategy].winRate = (b.wins / b.total) * 100;
  }
  return out;
}
