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
  tokenExpiresAt: number | null;
  scope: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  metadata: Record<string, unknown> | null;
}

export type TradeDecisionStatus =
  | "proposed"
  | "reviewed"
  | "approved"
  | "rejected"
  | "submitted"
  | "cancel_requested"
  | "filled"
  | "cancelled"
  | "failed";

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
  status: TradeDecisionStatus;
  mode: TradingMode;
  notionalUsd: number | null;
  quantity: number | null;
  orderType: "market" | "limit";
  limitPrice: number | null;
  timeInForce: string;
  idempotencyKey: string | null;
  review: Record<string, unknown> | null;
  reviewExpiresAt: number | null;
  brokerOrderId: string | null;
  brokerStatus: string | null;
  submittedAt: string | null;
  filledAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface RobinhoodTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  clientId: string | null;
  scope: string | null;
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
      tokenExpiresAt: null,
      scope: null,
      lastVerifiedAt: null,
      lastError: null,
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
    tokenExpiresAt: row.token_expires_at === null ? null : Number(row.token_expires_at),
    scope: row.scope ? String(row.scope) : null,
    lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    metadata,
  };
}

export function upsertRobinhoodConnection(input: {
  wallet: string;
  status: RobinhoodConnection["status"];
  agenticAccountHint?: string;
  metadata?: Record<string, unknown>;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId?: string;
  scope?: string;
  lastVerifiedAt?: string;
  lastError?: string | null;
}): RobinhoodConnection {
  const wallet = input.wallet.toLowerCase();
  const tokenEnc = input.accessToken ? encryptSecret(input.accessToken) : null;
  const refreshEnc = input.refreshToken ? encryptSecret(input.refreshToken) : null;
  db()
    .prepare(
      `INSERT INTO robinhood_connections
        (wallet, status, agentic_account_hint, access_token_enc, refresh_token_enc,
         token_expires_at, oauth_client_id, scope, last_verified_at, last_error,
         metadata, connected_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET
         status = excluded.status,
         agentic_account_hint = COALESCE(excluded.agentic_account_hint, robinhood_connections.agentic_account_hint),
         access_token_enc = COALESCE(excluded.access_token_enc, robinhood_connections.access_token_enc),
         refresh_token_enc = COALESCE(excluded.refresh_token_enc, robinhood_connections.refresh_token_enc),
         token_expires_at = COALESCE(excluded.token_expires_at, robinhood_connections.token_expires_at),
         oauth_client_id = COALESCE(excluded.oauth_client_id, robinhood_connections.oauth_client_id),
         scope = COALESCE(excluded.scope, robinhood_connections.scope),
         last_verified_at = COALESCE(excluded.last_verified_at, robinhood_connections.last_verified_at),
         last_error = excluded.last_error,
         metadata = COALESCE(excluded.metadata, robinhood_connections.metadata),
         connected_at = COALESCE(robinhood_connections.connected_at, excluded.connected_at),
         updated_at = excluded.updated_at`
    )
    .run(
      wallet,
      input.status,
      input.agenticAccountHint ?? null,
      tokenEnc,
      refreshEnc,
      input.expiresAt ?? null,
      input.clientId ?? null,
      input.scope ?? null,
      input.lastVerifiedAt ?? null,
      input.lastError ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.status === "linked" ? new Date().toISOString() : null,
      new Date().toISOString()
    );
  return getRobinhoodConnection(wallet);
}

export function getRobinhoodTokens(wallet: string): RobinhoodTokens | null {
  const row = db()
    .prepare(
      `SELECT access_token_enc, refresh_token_enc, token_expires_at, oauth_client_id, scope
       FROM robinhood_connections WHERE wallet = ?`
    )
    .get(wallet.toLowerCase()) as
    | {
        access_token_enc: string | null;
        refresh_token_enc: string | null;
        token_expires_at: number | null;
        oauth_client_id: string | null;
        scope: string | null;
      }
    | undefined;
  if (!row?.access_token_enc) return null;
  const accessToken = decryptSecret(row.access_token_enc);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : null,
    expiresAt: row.token_expires_at === null ? null : Number(row.token_expires_at),
    clientId: row.oauth_client_id,
    scope: row.scope,
  };
}

export function replaceRobinhoodTokens(input: {
  wallet: string;
  status?: "linked" | "paused";
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  clientId: string;
  scope: string | null;
}): RobinhoodConnection {
  const wallet = input.wallet.toLowerCase();
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO robinhood_connections
        (wallet, status, access_token_enc, refresh_token_enc, token_expires_at,
         oauth_client_id, scope, connected_at, updated_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(wallet) DO UPDATE SET
         status = excluded.status,
         access_token_enc = excluded.access_token_enc,
         refresh_token_enc = excluded.refresh_token_enc,
         token_expires_at = excluded.token_expires_at,
         oauth_client_id = excluded.oauth_client_id,
         scope = excluded.scope,
         connected_at = excluded.connected_at,
         updated_at = excluded.updated_at,
         last_error = NULL`
    )
    .run(
      wallet,
      input.status ?? "linked",
      encryptSecret(input.accessToken),
      input.refreshToken ? encryptSecret(input.refreshToken) : null,
      input.expiresAt,
      input.clientId,
      input.scope,
      now,
      now
    );
  return getRobinhoodConnection(wallet);
}

export function disconnectRobinhood(wallet: string, revoked = false): RobinhoodConnection {
  const normalized = wallet.toLowerCase();
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO robinhood_connections (wallet, status, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET
         status = excluded.status,
         access_token_enc = NULL,
         refresh_token_enc = NULL,
         token_expires_at = NULL,
         last_error = NULL,
         updated_at = excluded.updated_at`
    )
    .run(normalized, revoked ? "revoked" : "disconnected", now);
  return getRobinhoodConnection(normalized);
}

export function disconnectRobinhoodIfRefreshToken(
  wallet: string,
  expectedRefreshToken: string
): boolean {
  const normalized = wallet.toLowerCase();
  return db().transaction(() => {
    const row = db()
      .prepare("SELECT refresh_token_enc FROM robinhood_connections WHERE wallet = ?")
      .get(normalized) as { refresh_token_enc: string | null } | undefined;
    const current = row?.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : null;
    if (current !== expectedRefreshToken) return false;
    const result = db()
      .prepare(
        `UPDATE robinhood_connections
         SET status = 'revoked', access_token_enc = NULL, refresh_token_enc = NULL,
             token_expires_at = NULL, updated_at = ?
         WHERE wallet = ?`
      )
      .run(new Date().toISOString(), normalized);
    return result.changes === 1;
  })();
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

export function acquireRobinhoodWalletLease(wallet: string, leaseMs = 120_000): string | null {
  const normalized = wallet.toLowerCase();
  const owner = crypto.randomUUID();
  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT INTO robinhood_wallet_locks (wallet, owner, lease_until)
       VALUES (?, ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET owner = excluded.owner, lease_until = excluded.lease_until
       WHERE robinhood_wallet_locks.lease_until < ?`
    )
    .run(normalized, owner, now + leaseMs, now);
  return result.changes === 1 ? owner : null;
}

export function releaseRobinhoodWalletLease(wallet: string, owner: string): void {
  db()
    .prepare("DELETE FROM robinhood_wallet_locks WHERE wallet = ? AND owner = ?")
    .run(wallet.toLowerCase(), owner);
}

export function pendingSymbolExposureUsd(
  wallet: string,
  symbol: string,
  excludeDecisionId?: number
): number {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(notional_usd), 0) AS exposure
       FROM trade_decisions
       WHERE wallet = ? AND symbol = ? AND side = 'buy'
         AND status IN ('reviewed', 'approved', 'submitted', 'cancel_requested')
         AND (? IS NULL OR id != ?)`
    )
    .get(
      wallet.toLowerCase(),
      symbol.toUpperCase(),
      excludeDecisionId ?? null,
      excludeDecisionId ?? null
    ) as { exposure: number };
  return Number(row?.exposure ?? 0);
}

export function pendingCapitalReservationUsd(wallet: string, excludeDecisionId?: number): number {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(notional_usd), 0) AS exposure
       FROM trade_decisions
       WHERE wallet = ? AND side = 'buy'
         AND status IN ('reviewed', 'approved', 'submitted', 'cancel_requested')
         AND (? IS NULL OR id != ?)`
    )
    .get(
      wallet.toLowerCase(),
      excludeDecisionId ?? null,
      excludeDecisionId ?? null
    ) as { exposure: number };
  return Number(row?.exposure ?? 0);
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
  quantity?: number;
  orderType?: "market" | "limit";
  limitPrice?: number;
  timeInForce?: string;
  idempotencyKey?: string;
  review?: Record<string, unknown>;
  reviewExpiresAt?: number;
  status?: TradeDecisionStatus;
  metadata?: Record<string, unknown>;
}): TradeDecision {
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const existing = db()
    .prepare("SELECT * FROM trade_decisions WHERE wallet = ? AND idempotency_key = ?")
    .get(input.wallet.toLowerCase(), idempotencyKey) as Record<string, unknown> | undefined;
  if (existing) {
    const replay = decisionFromRow(existing);
    const samePayload =
      replay.symbol === input.symbol.toUpperCase() &&
      replay.side === input.side &&
      replay.quantity === (input.quantity ?? null) &&
      replay.notionalUsd === (input.notionalUsd ?? null) &&
      replay.orderType === (input.orderType ?? "market") &&
      replay.limitPrice === (input.limitPrice ?? null);
    if (!samePayload) throw new Error("Idempotency key was already used for a different order");
    return replay;
  }
  const now = new Date().toISOString();
  const status = input.status ?? "proposed";
  const result = db()
    .prepare(
      `INSERT INTO trade_decisions
        (wallet, symbol, side, thesis, confidence, policy_version, policy_allowed, policy_reasons,
         status, mode, notional_usd, quantity, order_type, limit_price, time_in_force,
         idempotency_key, review_json, review_expires_at, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`
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
      status,
      input.mode,
      input.notionalUsd ?? null,
      input.quantity ?? null,
      input.orderType ?? "market",
      input.limitPrice ?? null,
      input.timeInForce ?? "gfd",
      idempotencyKey,
      input.review ? JSON.stringify(input.review) : null,
      input.reviewExpiresAt ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      now
    );
  if (result.changes === 0) {
    const replay = db()
      .prepare("SELECT * FROM trade_decisions WHERE wallet = ? AND idempotency_key = ?")
      .get(input.wallet.toLowerCase(), idempotencyKey) as Record<string, unknown> | undefined;
    if (replay) {
      const decision = decisionFromRow(replay);
      const samePayload =
        decision.symbol === input.symbol.toUpperCase() &&
        decision.side === input.side &&
        decision.quantity === (input.quantity ?? null) &&
        decision.notionalUsd === (input.notionalUsd ?? null) &&
        decision.orderType === (input.orderType ?? "market") &&
        decision.limitPrice === (input.limitPrice ?? null);
      if (!samePayload) throw new Error("Idempotency key was already used for a different order");
      return decision;
    }
    throw new Error("Trade decision could not be persisted");
  }
  const id = Number(result.lastInsertRowid);
  appendDecisionEvent(id, input.wallet, null, status, { source: "create" });
  const row = db().prepare("SELECT * FROM trade_decisions WHERE id = ?").get(id) as Record<string, unknown>;
  return decisionFromRow(row);
}

export function getTradeDecision(wallet: string, id: number): TradeDecision | null {
  const row = db()
    .prepare("SELECT * FROM trade_decisions WHERE id = ? AND wallet = ?")
    .get(id, wallet.toLowerCase()) as Record<string, unknown> | undefined;
  return row ? decisionFromRow(row) : null;
}

export function updateDecisionStatus(
  wallet: string,
  id: number,
  status: TradeDecision["status"],
  options: {
    from?: TradeDecisionStatus[];
    brokerOrderId?: string;
    brokerStatus?: string;
    details?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  } = {}
): TradeDecision | null {
  const row = db()
    .prepare("SELECT * FROM trade_decisions WHERE id = ? AND wallet = ?")
    .get(id, wallet.toLowerCase()) as Record<string, unknown> | undefined;
  if (!row) return null;
  const previous = String(row.status) as TradeDecisionStatus;
  if (options.from && !options.from.includes(previous)) return null;
  const now = new Date().toISOString();
  const submittedAt = status === "submitted" ? now : row.submitted_at;
  const filledAt = status === "filled" ? now : row.filled_at;
  const failedAt = status === "failed" ? now : row.failed_at;
  const currentMetadata = parseObject(row.metadata);
  const metadata = options.metadata ? { ...(currentMetadata ?? {}), ...options.metadata } : currentMetadata;
  const result = db()
    .prepare(
      `UPDATE trade_decisions
       SET status = ?, broker_order_id = COALESCE(?, broker_order_id),
           broker_status = COALESCE(?, broker_status), submitted_at = ?,
           filled_at = ?, failed_at = ?, metadata = ?, updated_at = ?
       WHERE id = ? AND wallet = ? AND status = ?`
    )
    .run(
      status,
      options.brokerOrderId ?? null,
      options.brokerStatus ?? null,
      submittedAt ?? null,
      filledAt ?? null,
      failedAt ?? null,
      metadata ? JSON.stringify(metadata) : null,
      now,
      id,
      wallet.toLowerCase(),
      previous
    );
  if (result.changes !== 1) return null;
  appendDecisionEvent(id, wallet, previous, status, options.details);
  const updated = db()
    .prepare("SELECT * FROM trade_decisions WHERE id = ?")
    .get(id) as Record<string, unknown>;
  return decisionFromRow(updated);
}

export function updateDecisionReview(
  wallet: string,
  id: number,
  review: Record<string, unknown>,
  expiresAt: number,
  metadata?: Record<string, unknown>
): TradeDecision | null {
  const row = getTradeDecision(wallet, id);
  if (!row || row.status !== "proposed") return null;
  const now = new Date().toISOString();
  const result = db()
    .prepare(
      `UPDATE trade_decisions SET status = 'reviewed', review_json = ?, review_expires_at = ?,
       metadata = COALESCE(?, metadata), updated_at = ?
       WHERE id = ? AND wallet = ? AND status = 'proposed'`
    )
    .run(
      JSON.stringify(review),
      expiresAt,
      metadata ? JSON.stringify({ ...(row.metadata ?? {}), ...metadata }) : null,
      now,
      id,
      wallet.toLowerCase()
    );
  if (result.changes !== 1) return null;
  appendDecisionEvent(id, wallet, "proposed", "reviewed", { reviewExpiresAt: expiresAt });
  return getTradeDecision(wallet, id);
}

export function updateDecisionPolicy(
  wallet: string,
  id: number,
  allowed: boolean,
  reasons: string[],
  policyVersion: number
): TradeDecision | null {
  db()
    .prepare(
      `UPDATE trade_decisions SET policy_allowed = ?, policy_reasons = ?, policy_version = ?, updated_at = ?
       WHERE id = ? AND wallet = ?`
    )
    .run(
      allowed ? 1 : 0,
      JSON.stringify(reasons),
      policyVersion,
      new Date().toISOString(),
      id,
      wallet.toLowerCase()
    );
  return getTradeDecision(wallet, id);
}

export function updateDecisionNotional(
  wallet: string,
  id: number,
  notionalUsd: number
): TradeDecision | null {
  const result = db()
    .prepare(
      `UPDATE trade_decisions SET notional_usd = ?, updated_at = ?
       WHERE id = ? AND wallet = ? AND status IN ('proposed', 'reviewed')`
    )
    .run(notionalUsd, new Date().toISOString(), id, wallet.toLowerCase());
  return result.changes === 1 ? getTradeDecision(wallet, id) : null;
}

export function claimDecisionSubmission(wallet: string, id: number): TradeDecision | null {
  if (process.env.ROBINHOOD_TRADING_DISABLED === "1") return null;
  const rolloutStage = process.env.ROBINHOOD_ROLLOUT_STAGE ?? "read_only";
  if (rolloutStage !== "approval" && rolloutStage !== "autonomous") return null;
  const normalized = wallet.toLowerCase();
  const now = new Date().toISOString();
  const result = db()
    .prepare(
      `UPDATE trade_decisions
       SET status = 'submitted', broker_status = 'submitting', submitted_at = ?, updated_at = ?
       WHERE id = ? AND wallet = ? AND status = 'approved'
         AND review_expires_at >= ?
         AND EXISTS (
           SELECT 1 FROM trading_policies p
           WHERE p.wallet = trade_decisions.wallet
             AND p.enabled = 1 AND p.kill_switch = 0
             AND p.version = trade_decisions.policy_version
             AND p.mode = trade_decisions.mode
             AND p.mode IN ('approval', 'autonomous')
             AND (? = 'autonomous' OR (? = 'approval' AND p.mode = 'approval'))
         )
         AND EXISTS (
           SELECT 1 FROM robinhood_connections c
           WHERE c.wallet = trade_decisions.wallet AND c.status = 'linked'
         )`
    )
    .run(now, now, id, normalized, Date.now(), rolloutStage, rolloutStage);
  if (result.changes !== 1) return null;
  appendDecisionEvent(id, normalized, "approved", "submitted", { source: "atomic_claim" });
  return getTradeDecision(normalized, id);
}

export function listSubmittedTradeDecisions(limit = 100): TradeDecision[] {
  return (db()
    .prepare(
      `SELECT * FROM trade_decisions WHERE status IN ('submitted', 'cancel_requested')
       ORDER BY submitted_at ASC LIMIT ?`
    )
    .all(Math.min(limit, 500)) as Record<string, unknown>[]).map(decisionFromRow);
}

export function listDecisionEvents(wallet: string, decisionId: number): Record<string, unknown>[] {
  return db()
    .prepare(
      `SELECT id, decision_id, wallet, from_status, to_status, details, created_at
       FROM trade_decision_events WHERE wallet = ? AND decision_id = ? ORDER BY id ASC`
    )
    .all(wallet.toLowerCase(), decisionId) as Record<string, unknown>[];
}

function appendDecisionEvent(
  decisionId: number,
  wallet: string,
  from: TradeDecisionStatus | null,
  to: TradeDecisionStatus,
  details?: Record<string, unknown>
): void {
  db()
    .prepare(
      `INSERT INTO trade_decision_events
       (decision_id, wallet, from_status, to_status, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      decisionId,
      wallet.toLowerCase(),
      from,
      to,
      details ? JSON.stringify(details) : null,
      new Date().toISOString()
    );
}

function parseObject(value: unknown): Record<string, unknown> | null {
  try {
    return value ? (JSON.parse(String(value)) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function decisionFromRow(row: Record<string, unknown>): TradeDecision {
  let policyReasons: string[] = [];
  let metadata: Record<string, unknown> | null = null;
  let review: Record<string, unknown> | null = null;
  try {
    policyReasons = JSON.parse(String(row.policy_reasons ?? "[]")) as string[];
  } catch {}
  try {
    metadata = row.metadata ? (JSON.parse(String(row.metadata)) as Record<string, unknown>) : null;
  } catch {}
  try {
    review = row.review_json ? (JSON.parse(String(row.review_json)) as Record<string, unknown>) : null;
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
    quantity: row.quantity === null ? null : Number(row.quantity),
    orderType: String(row.order_type ?? "market") as "market" | "limit",
    limitPrice: row.limit_price === null ? null : Number(row.limit_price),
    timeInForce: String(row.time_in_force ?? "gfd"),
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    review,
    reviewExpiresAt: row.review_expires_at === null ? null : Number(row.review_expires_at),
    brokerOrderId: row.broker_order_id ? String(row.broker_order_id) : null,
    brokerStatus: row.broker_status ? String(row.broker_status) : null,
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    filledAt: row.filled_at ? String(row.filled_at) : null,
    failedAt: row.failed_at ? String(row.failed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
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
