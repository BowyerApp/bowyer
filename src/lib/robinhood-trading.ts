import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/oauth/crypto";
import {
  DEFAULT_TRADING_POLICY,
  type TradingMode,
  type TradingPolicy,
} from "@/lib/trading-policy";
import { ROBINHOOD_TRADING_MCP } from "@/lib/mcp";

export const ROBINHOOD_AGENTIC_URL = "https://robinhood.com/us/en/agentic-trading/";
export const ROBINHOOD_MCP_DOCS =
  "https://robinhood.com/us/en/support/articles/agentic-trading-overview/";

export interface RobinhoodConnection {
  wallet: string;
  status: "disconnected" | "linked" | "paused" | "revoked";
  agenticAccountHint: string | null;
  mcpEndpoint: string;
  connectedAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface TradeDecision {
  id: number;
  wallet: string;
  symbol: string;
  side: "buy" | "sell" | "hold";
  thesis: string;
  confidence: number | null;
  policyVersion: number;
  policyAllowed: number;
  policyReasons: string[];
  status: "proposed" | "approved" | "rejected" | "submitted" | "filled" | "failed";
  mode: TradingMode;
  notionalUsd: number | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

function policyRowToPolicy(row: Record<string, unknown>): TradingPolicy {
  return {
    wallet: String(row.wallet),
    mode: String(row.mode) as TradingMode,
    enabled: row.enabled === 1,
    killSwitch: row.kill_switch === 1,
    maxOrderUsd: Number(row.max_order_usd),
    maxPositionUsd: Number(row.max_position_usd),
    maxDailyLossUsd: Number(row.max_daily_loss_usd),
    maxDailyTrades: Number(row.max_daily_trades),
    cashReserveUsd: Number(row.cash_reserve_usd),
    allowedSymbols: row.allowed_symbols
      ? (JSON.parse(String(row.allowed_symbols)) as string[])
      : [],
    strategyNotes: String(row.strategy_notes ?? ""),
    version: Number(row.version),
    updatedAt: String(row.updated_at),
  };
}

export function getRobinhoodConnection(wallet: string): RobinhoodConnection {
  const row = db()
    .prepare("SELECT * FROM robinhood_connections WHERE wallet = ?")
    .get(wallet.toLowerCase()) as Record<string, unknown> | undefined;
  if (!row) {
    return {
      wallet: wallet.toLowerCase(),
      status: "disconnected",
      agenticAccountHint: null,
      mcpEndpoint: ROBINHOOD_TRADING_MCP,
      connectedAt: null,
      metadata: null,
    };
  }
  let metadata: Record<string, unknown> | null = null;
  try {
    metadata = row.metadata ? (JSON.parse(String(row.metadata)) as Record<string, unknown>) : null;
  } catch {}
  return {
    wallet: String(row.wallet),
    status: String(row.status) as RobinhoodConnection["status"],
    agenticAccountHint: row.agentic_account_hint ? String(row.agentic_account_hint) : null,
    mcpEndpoint: ROBINHOOD_TRADING_MCP,
    connectedAt: row.connected_at ? String(row.connected_at) : null,
    metadata,
  };
}

export function upsertRobinhoodConnection(input: {
  wallet: string;
  status: RobinhoodConnection["status"];
  agenticAccountHint?: string;
  metadata?: Record<string, unknown>;
  accessToken?: string;
}): RobinhoodConnection {
  const wallet = input.wallet.toLowerCase();
  const tokenEnc = input.accessToken ? encryptSecret(input.accessToken) : null;
  db()
    .prepare(
      `INSERT INTO robinhood_connections
        (wallet, status, agentic_account_hint, access_token_enc, metadata, connected_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET
         status = excluded.status,
         agentic_account_hint = excluded.agentic_account_hint,
         access_token_enc = COALESCE(excluded.access_token_enc, robinhood_connections.access_token_enc),
         metadata = excluded.metadata,
         connected_at = COALESCE(robinhood_connections.connected_at, excluded.connected_at),
         updated_at = excluded.updated_at`
    )
    .run(
      wallet,
      input.status,
      input.agenticAccountHint ?? null,
      tokenEnc,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.status === "linked" ? new Date().toISOString() : null,
      new Date().toISOString()
    );
  return getRobinhoodConnection(wallet);
}

export function getTradingPolicy(wallet: string): TradingPolicy {
  const w = wallet.toLowerCase();
  const row = db()
    .prepare("SELECT * FROM trading_policies WHERE wallet = ?")
    .get(w) as Record<string, unknown> | undefined;
  if (!row) {
    const now = new Date().toISOString();
    const policy: TradingPolicy = { ...DEFAULT_TRADING_POLICY, wallet: w, updatedAt: now };
    db()
      .prepare(
        `INSERT INTO trading_policies
          (wallet, mode, enabled, kill_switch, max_order_usd, max_position_usd, max_daily_loss_usd,
           max_daily_trades, cash_reserve_usd, allowed_symbols, strategy_notes, version, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        w,
        policy.mode,
        policy.enabled ? 1 : 0,
        policy.killSwitch ? 1 : 0,
        policy.maxOrderUsd,
        policy.maxPositionUsd,
        policy.maxDailyLossUsd,
        policy.maxDailyTrades,
        policy.cashReserveUsd,
        JSON.stringify(policy.allowedSymbols),
        policy.strategyNotes,
        policy.version,
        policy.updatedAt
      );
    return policy;
  }
  return policyRowToPolicy(row);
}

export function saveTradingPolicy(policy: TradingPolicy): TradingPolicy {
  const wallet = policy.wallet.toLowerCase();
  const nextVersion = policy.version + 1;
  const updated: TradingPolicy = {
    ...policy,
    wallet,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  };
  db()
    .prepare(
      `INSERT INTO trading_policies
        (wallet, mode, enabled, kill_switch, max_order_usd, max_position_usd, max_daily_loss_usd,
         max_daily_trades, cash_reserve_usd, allowed_symbols, strategy_notes, version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET
         mode = excluded.mode,
         enabled = excluded.enabled,
         kill_switch = excluded.kill_switch,
         max_order_usd = excluded.max_order_usd,
         max_position_usd = excluded.max_position_usd,
         max_daily_loss_usd = excluded.max_daily_loss_usd,
         max_daily_trades = excluded.max_daily_trades,
         cash_reserve_usd = excluded.cash_reserve_usd,
         allowed_symbols = excluded.allowed_symbols,
         strategy_notes = excluded.strategy_notes,
         version = excluded.version,
         updated_at = excluded.updated_at`
    )
    .run(
      wallet,
      updated.mode,
      updated.enabled ? 1 : 0,
      updated.killSwitch ? 1 : 0,
      updated.maxOrderUsd,
      updated.maxPositionUsd,
      updated.maxDailyLossUsd,
      updated.maxDailyTrades,
      updated.cashReserveUsd,
      JSON.stringify(updated.allowedSymbols),
      updated.strategyNotes,
      updated.version,
      updated.updatedAt
    );
  db()
    .prepare(`INSERT INTO trading_policy_audit (wallet, policy_json, created_at) VALUES (?, ?, ?)`)
    .run(wallet, JSON.stringify(updated), updated.updatedAt);
  return updated;
}

export function listTradeDecisions(wallet: string, limit = 20): TradeDecision[] {
  const rows = db()
    .prepare(
      `SELECT * FROM trade_decisions WHERE wallet = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(wallet.toLowerCase(), Math.min(limit, 50)) as Record<string, unknown>[];
  return rows.map(decisionFromRow);
}

export function createTradeDecision(input: {
  wallet: string;
  symbol: string;
  side: TradeDecision["side"];
  thesis: string;
  confidence?: number;
  policyVersion: number;
  policyAllowed: boolean;
  policyReasons: string[];
  mode: TradingMode;
  notionalUsd?: number;
  metadata?: Record<string, unknown>;
}): TradeDecision {
  const result = db()
    .prepare(
      `INSERT INTO trade_decisions
        (wallet, symbol, side, thesis, confidence, policy_version, policy_allowed, policy_reasons,
         status, mode, notional_usd, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?)`
    )
    .run(
      input.wallet.toLowerCase(),
      input.symbol.toUpperCase(),
      input.side,
      input.thesis,
      input.confidence ?? null,
      input.policyVersion,
      input.policyAllowed ? 1 : 0,
      JSON.stringify(input.policyReasons),
      input.mode,
      input.notionalUsd ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      new Date().toISOString()
    );
  const row = db()
    .prepare("SELECT * FROM trade_decisions WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  return decisionFromRow(row);
}

export function updateDecisionStatus(
  wallet: string,
  id: number,
  status: TradeDecision["status"]
): TradeDecision | null {
  const row = db()
    .prepare("SELECT * FROM trade_decisions WHERE id = ? AND wallet = ?")
    .get(id, wallet.toLowerCase()) as Record<string, unknown> | undefined;
  if (!row) return null;
  db()
    .prepare("UPDATE trade_decisions SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, new Date().toISOString(), id);
  const updated = db()
    .prepare("SELECT * FROM trade_decisions WHERE id = ?")
    .get(id) as Record<string, unknown>;
  return decisionFromRow(updated);
}

function decisionFromRow(row: Record<string, unknown>): TradeDecision {
  let policyReasons: string[] = [];
  let metadata: Record<string, unknown> | null = null;
  try {
    policyReasons = JSON.parse(String(row.policy_reasons ?? "[]")) as string[];
  } catch {}
  try {
    metadata = row.metadata ? (JSON.parse(String(row.metadata)) as Record<string, unknown>) : null;
  } catch {}
  return {
    id: Number(row.id),
    wallet: String(row.wallet),
    symbol: String(row.symbol),
    side: String(row.side) as TradeDecision["side"],
    thesis: String(row.thesis),
    confidence: row.confidence === null ? null : Number(row.confidence),
    policyVersion: Number(row.policy_version),
    policyAllowed: Number(row.policy_allowed),
    policyReasons,
    status: String(row.status) as TradeDecision["status"],
    mode: String(row.mode) as TradingMode,
    notionalUsd: row.notional_usd === null ? null : Number(row.notional_usd),
    createdAt: String(row.created_at),
    metadata,
  };
}

export function dailyTradeStats(wallet: string): { trades: number; realizedLossUsd: number } {
  const day = new Date().toISOString().slice(0, 10);
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS trades FROM trade_decisions
       WHERE wallet = ? AND date(created_at) = ? AND status IN ('submitted', 'filled')`
    )
    .get(wallet.toLowerCase(), day) as { trades: number };
  return { trades: row?.trades ?? 0, realizedLossUsd: 0 };
}

export function getRobinhoodAccessToken(wallet: string): string | null {
  const row = db()
    .prepare("SELECT access_token_enc FROM robinhood_connections WHERE wallet = ?")
    .get(wallet.toLowerCase()) as { access_token_enc: string | null } | undefined;
  if (!row?.access_token_enc) return null;
  return decryptSecret(row.access_token_enc);
}
