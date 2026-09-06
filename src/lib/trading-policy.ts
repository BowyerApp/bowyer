/** Deterministic pre-trade policy — evaluated server-side before any broker call. */

export type TradingMode = "research" | "simulate" | "paper" | "approval" | "autonomous";

export interface TradingPolicy {
  wallet: string;
  mode: TradingMode;
  enabled: boolean;
  killSwitch: boolean;
  maxOrderUsd: number;
  maxPositionUsd: number;
  maxDailyLossUsd: number;
  maxDailyTrades: number;
  cashReserveUsd: number;
  allowedSymbols: string[];
  strategyNotes: string;
  version: number;
  updatedAt: string;
}

export interface OrderIntent {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  notionalUsd: number;
  orderType: "market" | "limit";
  limitPrice?: number;
}

export interface PolicyCheckResult {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
}

export const DEFAULT_TRADING_POLICY: Omit<TradingPolicy, "wallet" | "updatedAt"> = {
  mode: "approval",
  enabled: true,
  killSwitch: false,
  maxOrderUsd: 500,
  maxPositionUsd: 2_500,
  maxDailyLossUsd: 250,
  maxDailyTrades: 5,
  cashReserveUsd: 500,
  allowedSymbols: [],
  strategyNotes: "",
  version: 1,
};

export type RobinhoodRolloutStage = "read_only" | "paper" | "approval" | "autonomous";

export function robinhoodRolloutStage(): RobinhoodRolloutStage {
  const value = process.env.ROBINHOOD_ROLLOUT_STAGE;
  return value === "paper" || value === "approval" || value === "autonomous"
    ? value
    : "read_only";
}

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

export function evaluatePolicy(
  policy: TradingPolicy,
  intent: OrderIntent,
  context: {
    dailyTrades: number;
    dailyRealizedLossUsd: number;
    openConcentrationUsd?: number;
    buyingPowerUsd?: number;
    marketOpen?: boolean;
    tradable?: boolean;
    connectionStatus?: "disconnected" | "linked" | "paused" | "revoked";
    quoteAgeMs?: number;
  }
): PolicyCheckResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!policy.enabled) reasons.push("Trading policy is disabled.");
  if (policy.killSwitch) reasons.push("Kill switch is active.");
  if (policy.mode === "research") reasons.push("Account is in research-only mode.");
  if (policy.mode === "simulate") reasons.push("Account is in simulation mode — no live orders.");
  if (policy.mode === "paper") reasons.push("Account is in paper mode — no broker submission.");
  if (process.env.ROBINHOOD_TRADING_DISABLED === "1") {
    reasons.push("Robinhood trading is disabled globally.");
  }
  const rolloutStage = robinhoodRolloutStage();
  if (
    (policy.mode === "approval" && !["approval", "autonomous"].includes(rolloutStage)) ||
    (policy.mode === "autonomous" && rolloutStage !== "autonomous")
  ) {
    reasons.push(`Robinhood rollout stage ${rolloutStage} does not permit ${policy.mode} orders.`);
  }
  if (context.connectionStatus && context.connectionStatus !== "linked") {
    reasons.push(`Robinhood connection is ${context.connectionStatus}.`);
  }

  const symbol = normalizeSymbol(intent.symbol);
  if (!symbol || symbol.length > 12) reasons.push("Invalid symbol.");
  if (policy.allowedSymbols.length > 0 && !policy.allowedSymbols.includes(symbol)) {
    reasons.push(`Symbol ${symbol} is not on the allowlist.`);
  }

  if (
    !Number.isFinite(intent.notionalUsd) ||
    !Number.isFinite(intent.quantity) ||
    intent.notionalUsd <= 0 ||
    intent.quantity <= 0
  ) {
    reasons.push("Order size must be positive.");
  }
  if (intent.orderType !== "market" && intent.orderType !== "limit") {
    reasons.push("Unsupported order type.");
  }
  if (
    intent.orderType === "limit" &&
    (!Number.isFinite(intent.limitPrice) || Number(intent.limitPrice) <= 0)
  ) {
    reasons.push("Limit orders require a positive limit price.");
  }
  if (intent.notionalUsd > policy.maxOrderUsd) {
    reasons.push(`Order exceeds max order size ($${policy.maxOrderUsd}).`);
  }
  if (
    intent.side === "buy" &&
    (context.openConcentrationUsd ?? 0) + intent.notionalUsd > policy.maxPositionUsd
  ) {
    reasons.push(`Order would exceed max position size ($${policy.maxPositionUsd}).`);
  }
  if (context.dailyTrades >= policy.maxDailyTrades) {
    reasons.push(`Daily trade limit reached (${policy.maxDailyTrades}).`);
  }
  if (context.dailyRealizedLossUsd >= policy.maxDailyLossUsd) {
    reasons.push(`Daily loss limit reached ($${policy.maxDailyLossUsd}).`);
  }
  if (
    intent.side === "buy" &&
    context.buyingPowerUsd !== undefined &&
    context.buyingPowerUsd - intent.notionalUsd < policy.cashReserveUsd
  ) {
    reasons.push(`Order would breach cash reserve ($${policy.cashReserveUsd}).`);
  }
  if (context.tradable === false) reasons.push(`${symbol} is not currently tradable.`);
  if (context.marketOpen === false) reasons.push("The relevant market is closed.");
  if (context.quoteAgeMs !== undefined && context.quoteAgeMs > 30_000) {
    reasons.push("Market quote is stale.");
  }

  if (policy.mode === "autonomous") {
    warnings.push("Autonomous mode — order will submit without manual approval.");
  } else if (policy.mode === "approval") {
    warnings.push("Approval required before broker submission.");
  }

  return { allowed: reasons.length === 0, reasons, warnings };
}

export function modeAllowsBrokerSubmit(mode: TradingMode): boolean {
  return mode === "approval" || mode === "autonomous";
}
