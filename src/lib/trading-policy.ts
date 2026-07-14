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
  mode: "research",
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
  }
): PolicyCheckResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!policy.enabled) reasons.push("Trading policy is disabled.");
  if (policy.killSwitch) reasons.push("Kill switch is active.");
  if (policy.mode === "research") reasons.push("Account is in research-only mode.");
  if (policy.mode === "simulate") reasons.push("Account is in simulation mode — no live orders.");
  if (policy.mode === "paper") reasons.push("Account is in paper mode — no broker submission.");

  const symbol = normalizeSymbol(intent.symbol);
  if (!symbol || symbol.length > 12) reasons.push("Invalid symbol.");
  if (policy.allowedSymbols.length > 0 && !policy.allowedSymbols.includes(symbol)) {
    reasons.push(`Symbol ${symbol} is not on the allowlist.`);
  }

  if (intent.notionalUsd <= 0 || intent.quantity <= 0) {
    reasons.push("Order size must be positive.");
  }
  if (intent.notionalUsd > policy.maxOrderUsd) {
    reasons.push(`Order exceeds max order size ($${policy.maxOrderUsd}).`);
  }
  if ((context.openConcentrationUsd ?? 0) + intent.notionalUsd > policy.maxPositionUsd) {
    reasons.push(`Order would exceed max position size ($${policy.maxPositionUsd}).`);
  }
  if (context.dailyTrades >= policy.maxDailyTrades) {
    reasons.push(`Daily trade limit reached (${policy.maxDailyTrades}).`);
  }
  if (context.dailyRealizedLossUsd >= policy.maxDailyLossUsd) {
    reasons.push(`Daily loss limit reached ($${policy.maxDailyLossUsd}).`);
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
