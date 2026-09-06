import {
  callRobinhoodTool,
  findRobinhoodTool,
  listRobinhoodTools,
  type McpToolDefinition,
  unwrapRobinhoodToolResult,
} from "@/lib/robinhood-mcp-client";
import {
  acquireRobinhoodWalletLease,
  claimDecisionSubmission,
  createTradeDecision,
  dailyTradeStats,
  getRobinhoodConnection,
  getTradeDecision,
  getTradingPolicy,
  listSubmittedTradeDecisions,
  pendingCapitalReservationUsd,
  pendingSymbolExposureUsd,
  releaseRobinhoodWalletLease,
  saveTradingPolicy,
  type TradeDecision,
  updateDecisionPolicy,
  updateDecisionNotional,
  updateDecisionReview,
  updateDecisionStatus,
} from "@/lib/robinhood-trading";
import {
  evaluatePolicy,
  modeAllowsBrokerSubmit,
  normalizeSymbol,
  type OrderIntent,
  type PolicyCheckResult,
} from "@/lib/trading-policy";
import {
  classifyRobinhoodOrderStatus,
  deriveRobinhoodOrderNotional,
  robinhoodReviewIsFresh,
} from "@/lib/robinhood-protocol";

const REVIEW_TTL_MS = Math.max(
  30_000,
  Number(process.env.ROBINHOOD_REVIEW_TTL_MS ?? 90_000)
);
const walletLocks = new Map<string, Promise<unknown>>();

interface BrokerContext {
  accountId?: string;
  buyingPowerUsd?: number;
  openConcentrationUsd: number;
  dailyRealizedLossUsd: number;
  marketOpen?: boolean;
  tradable?: boolean;
  quoteAgeMs?: number;
  quotePriceUsd?: number;
  positionsVerified: boolean;
  dailyPnlVerified: boolean;
  quoteVerified: boolean;
  raw: Record<string, unknown>;
}

interface ReviewEnvelope extends Record<string, unknown> {
  brokerReview: unknown;
  reviewTool: string;
  reviewArguments: Record<string, unknown>;
  placeTool: string;
  placeArguments: Record<string, unknown>;
  reviewedAt: string;
}

export interface ProposeRobinhoodTradeInput {
  wallet: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  notionalUsd: number;
  orderType?: "market" | "limit";
  limitPrice?: number;
  timeInForce?: string;
  thesis: string;
  confidence?: number;
  idempotencyKey?: string;
  source?: string;
}

function serialForWallet<T>(wallet: string, operation: () => Promise<T>): Promise<T> {
  const key = wallet.toLowerCase();
  const previous = walletLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const lease = acquireRobinhoodWalletLease(key);
    if (!lease) throw new Error("Another Robinhood operation is already in progress");
    try {
      return await operation();
    } finally {
      releaseRobinhoodWalletLease(key, lease);
    }
  });
  walletLocks.set(key, next);
  return next.finally(() => {
    if (walletLocks.get(key) === next) walletLocks.delete(key);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function recursivelyFindNumber(value: unknown, keys: string[]): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const wanted = new Set(keys.map(normalizeKey));
  if (!Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (wanted.has(normalizeKey(key))) {
        const number = typeof nested === "number" ? nested : Number(nested);
        if (Number.isFinite(number)) return number;
      }
    }
  }
  for (const nested of Object.values(value)) {
    const found = recursivelyFindNumber(nested, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function recursivelyFindString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const wanted = new Set(keys.map(normalizeKey));
  if (!Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (wanted.has(normalizeKey(key)) && typeof nested === "string" && nested) return nested;
    }
  }
  for (const nested of Object.values(value)) {
    const found = recursivelyFindString(nested, keys);
    if (found) return found;
  }
  return undefined;
}

function recursivelyFindBoolean(value: unknown, keys: string[]): boolean | undefined {
  if (!value || typeof value !== "object") return undefined;
  const wanted = new Set(keys.map(normalizeKey));
  if (!Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (!wanted.has(normalizeKey(key))) continue;
      if (typeof nested === "boolean") return nested;
      if (typeof nested === "string" && /^(true|false)$/i.test(nested)) {
        return nested.toLowerCase() === "true";
      }
    }
  }
  for (const nested of Object.values(value)) {
    const found = recursivelyFindBoolean(nested, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function directString(record: Record<string, unknown>, keys: string[]): string | undefined {
  const wanted = new Set(keys.map(normalizeKey));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizeKey(key)) && typeof value === "string" && value) return value;
  }
  return undefined;
}

function positionValueForSymbol(value: unknown, symbol: string): number {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + positionValueForSymbol(item, symbol), 0);
  }
  const record = value as Record<string, unknown>;
  const itemSymbol = recursivelyFindString(record, ["symbol", "ticker", "instrument_symbol"]);
  if (itemSymbol?.toUpperCase() === symbol) {
    return (
      recursivelyFindNumber(record, [
        "market_value",
        "marketValue",
        "equity",
        "current_value",
        "notional",
      ]) ?? 0
    );
  }
  return Object.values(record).reduce<number>(
    (sum, nested) => sum + positionValueForSymbol(nested, symbol),
    0
  );
}

function enumValue(schema: Record<string, unknown> | null, preferred: string): string {
  const values = Array.isArray(schema?.enum) ? schema.enum.map(String) : [];
  return values.find((value) => value.toLowerCase() === preferred.toLowerCase()) ?? preferred;
}

function orderArguments(
  tool: McpToolDefinition,
  intent: OrderIntent & { timeInForce: string },
  accountId: string | undefined,
  idempotencyKey: string,
  review: unknown = undefined
): Record<string, unknown> {
  const schema = asRecord(tool.inputSchema);
  const properties = asRecord(schema?.properties) ?? {};
  const required = Array.isArray(schema?.required) ? schema.required.map(String) : [];
  const output: Record<string, unknown> = {};
  if (!Object.keys(properties).length) {
    throw new Error(`Cannot safely execute ${tool.name} without an input schema`);
  }
  const reviewId = recursivelyFindString(review, [
    "review_id",
    "reviewId",
    "preview_id",
    "previewId",
    "review_token",
  ]);

  for (const [key, rawProperty] of Object.entries(properties)) {
    const normalized = normalizeKey(key);
    const property = asRecord(rawProperty);
    if (["symbol", "ticker", "instrumentsymbol"].includes(normalized)) output[key] = intent.symbol;
    else if (["side", "direction", "action"].includes(normalized)) {
      output[key] = enumValue(property, intent.side);
    } else if (["quantity", "qty", "shares"].includes(normalized)) output[key] = intent.quantity;
    else if (
      ["notional", "notionalusd", "dollaramount", "amountindollars", "amount"].includes(normalized)
    ) {
      output[key] = intent.notionalUsd;
    } else if (["ordertype", "type"].includes(normalized)) {
      output[key] = enumValue(property, intent.orderType);
    } else if (["limitprice", "price"].includes(normalized) && intent.limitPrice !== undefined) {
      output[key] = intent.limitPrice;
    } else if (["timeinforce", "tif"].includes(normalized)) {
      output[key] = enumValue(property, intent.timeInForce);
    } else if (["accountid", "account", "accountnumber"].includes(normalized) && accountId) {
      output[key] = accountId;
    } else if (["clientorderid", "idempotencykey"].includes(normalized)) {
      output[key] = idempotencyKey;
    } else if (
      ["reviewid", "previewid", "reviewtoken"].includes(normalized) &&
      reviewId
    ) {
      output[key] = reviewId;
    }
  }

  const unsupported = required.filter((key) => output[key] === undefined);
  if (unsupported.length) {
    throw new Error(
      `Cannot safely map required ${tool.name} fields: ${unsupported.join(", ")}`
    );
  }
  return output;
}

function findOrderTool(
  tools: McpToolDefinition[],
  kind: "review" | "place" | "cancel"
): McpToolDefinition {
  const candidates =
    kind === "review"
      ? ["review_order", "review_equity_order", "review_stock_order", "preview_order"]
      : kind === "place"
        ? ["place_order", "place_equity_order", "place_stock_order", "submit_order"]
        : ["cancel_order", "cancel_equity_order", "cancel_stock_order"];
  const found =
    findRobinhoodTool(tools, candidates) ??
    tools.find((tool) => {
      const name = tool.name.toLowerCase();
      return (
        name.includes(kind === "review" ? "review" : kind) &&
        (name.includes("order") || name.includes("trade"))
      );
    });
  if (!found) throw new Error(`Robinhood ${kind} order tool is unavailable`);
  return found;
}

async function fetchBrokerContext(wallet: string, symbol: string): Promise<BrokerContext> {
  const tools = await listRobinhoodTools(wallet);
  const portfolioTool = findRobinhoodTool(tools, [
    "get_portfolio",
    "get_account",
    "get_account_summary",
  ]);
  const positionsTool = findRobinhoodTool(tools, [
    "get_positions",
    "get_open_positions",
    "list_positions",
  ]);
  const pnlTool = findRobinhoodTool(tools, [
    "get_profit_and_loss",
    "get_realized_pnl",
    "get_account_pnl",
  ]);
  const quoteTool = findRobinhoodTool(tools, ["get_quote", "get_market_data", "get_stock_quote"]);

  const [portfolioResult, positionsResult, pnlResult, quoteResult] = await Promise.all([
    portfolioTool
      ? callRobinhoodTool(wallet, portfolioTool.name).then(unwrapRobinhoodToolResult)
      : Promise.resolve({}),
    positionsTool
      ? callRobinhoodTool(wallet, positionsTool.name).then(unwrapRobinhoodToolResult)
      : Promise.resolve({}),
    pnlTool
      ? callRobinhoodTool(wallet, pnlTool.name, { period: "day" }).then(unwrapRobinhoodToolResult)
      : Promise.resolve({}),
    quoteTool
      ? callRobinhoodTool(wallet, quoteTool.name, { symbol }).then(unwrapRobinhoodToolResult)
      : Promise.resolve({}),
  ]);

  const dailyPnl =
    recursivelyFindNumber(pnlResult, [
      "realized_pnl",
      "realizedPnl",
      "realized_profit_loss",
      "todays_realized_pnl",
    ]) ??
    recursivelyFindNumber(portfolioResult, [
      "realized_pnl",
      "realizedPnl",
      "todays_realized_pnl",
    ]);
  const tradableRaw = recursivelyFindString(quoteResult, ["tradability", "tradable", "state"]);
  const marketRaw = recursivelyFindString(quoteResult, ["market_state", "marketState", "session"]);
  const tradableBoolean = recursivelyFindBoolean(quoteResult, ["tradable", "is_tradable"]);
  const marketOpenBoolean = recursivelyFindBoolean(quoteResult, ["market_open", "is_market_open"]);
  const quoteTime = recursivelyFindString(quoteResult, ["updated_at", "timestamp", "as_of"]);
  const quoteTimestamp = recursivelyFindNumber(quoteResult, ["timestamp", "updated_at_ms", "as_of_ms"]);
  const parsedQuoteTime = quoteTime
    ? Date.parse(quoteTime)
    : quoteTimestamp
      ? quoteTimestamp < 10_000_000_000
        ? quoteTimestamp * 1_000
        : quoteTimestamp
      : Number.NaN;
  const quoteAgeMs = Number.isFinite(parsedQuoteTime)
    ? Math.max(0, Date.now() - parsedQuoteTime)
    : undefined;
  const quotePriceUsd = recursivelyFindNumber(quoteResult, [
    "price",
    "last_trade_price",
    "lastPrice",
    "mark_price",
    "markPrice",
    "ask_price",
  ]);
  const marketOpen = marketOpenBoolean ?? (marketRaw ? !/closed|halted/i.test(marketRaw) : undefined);
  const tradable =
    tradableBoolean ?? (tradableRaw ? !/untradable|inactive|halted/i.test(tradableRaw) : undefined);
  return {
    accountId: recursivelyFindString(portfolioResult, [
      "account_id",
      "accountId",
      "account_number",
      "accountNumber",
    ]),
    buyingPowerUsd: recursivelyFindNumber(portfolioResult, [
      "buying_power",
      "buyingPower",
      "cash_available_for_withdrawal",
      "cash",
    ]),
    openConcentrationUsd: positionValueForSymbol(positionsResult, symbol),
    dailyRealizedLossUsd: Math.max(0, -(dailyPnl ?? 0)),
    marketOpen,
    tradable,
    quoteAgeMs: Number.isFinite(quoteAgeMs) ? quoteAgeMs : undefined,
    quotePriceUsd:
      quotePriceUsd !== undefined && quotePriceUsd > 0 ? quotePriceUsd : undefined,
    positionsVerified: Boolean(positionsTool),
    dailyPnlVerified: dailyPnl !== undefined,
    quoteVerified: Boolean(
      quoteTool &&
        quotePriceUsd &&
        quotePriceUsd > 0 &&
        quoteAgeMs !== undefined &&
        quoteAgeMs <= 30_000 &&
        tradable !== undefined &&
        marketOpen !== undefined
    ),
    raw: { portfolio: portfolioResult, positions: positionsResult, pnl: pnlResult, quote: quoteResult },
  };
}

async function policyCheck(
  wallet: string,
  intent: OrderIntent,
  options: { context?: BrokerContext; excludeDecisionId?: number } = {}
): Promise<{ check: PolicyCheckResult; context: BrokerContext }> {
  const policy = getTradingPolicy(wallet);
  const connection = getRobinhoodConnection(wallet);
  const context = options.context ?? (await fetchBrokerContext(wallet, intent.symbol));
  const daily = dailyTradeStats(wallet);
  const pendingExposure = pendingSymbolExposureUsd(
    wallet,
    intent.symbol,
    options.excludeDecisionId
  );
  const pendingCapital = pendingCapitalReservationUsd(wallet, options.excludeDecisionId);
  const check = evaluatePolicy(policy, intent, {
    dailyTrades: daily.trades,
    dailyRealizedLossUsd: Math.max(daily.realizedLossUsd, context.dailyRealizedLossUsd),
    openConcentrationUsd: context.openConcentrationUsd + pendingExposure,
    buyingPowerUsd:
      context.buyingPowerUsd === undefined
        ? undefined
        : Math.max(0, context.buyingPowerUsd - pendingCapital),
    marketOpen: context.marketOpen,
    tradable: context.tradable,
    connectionStatus: connection.status,
    quoteAgeMs: context.quoteAgeMs,
  });
  if (context.buyingPowerUsd === undefined && intent.side === "buy") {
    check.reasons.push("Unable to verify live buying power.");
    check.allowed = false;
  }
  if (!context.positionsVerified && intent.side === "buy") {
    check.reasons.push("Unable to verify current symbol concentration.");
    check.allowed = false;
  }
  if (!context.dailyPnlVerified) {
    check.reasons.push("Unable to verify today's realized PnL.");
    check.allowed = false;
  }
  if (!context.quoteVerified) {
    check.reasons.push("Unable to verify live tradability and quote freshness.");
    check.allowed = false;
  }
  if (context.dailyRealizedLossUsd >= policy.maxDailyLossUsd && !policy.killSwitch) {
    saveTradingPolicy({ ...policy, killSwitch: true });
  }
  return { check, context };
}

function intentFromDecision(decision: TradeDecision): OrderIntent {
  if (!decision.quantity || !decision.notionalUsd || decision.side === "hold") {
    throw new Error("Decision does not contain an executable order");
  }
  return {
    symbol: decision.symbol,
    side: decision.side,
    quantity: decision.quantity,
    notionalUsd: decision.notionalUsd,
    orderType: decision.orderType,
    ...(decision.limitPrice !== null ? { limitPrice: decision.limitPrice } : {}),
  };
}

function reviewedNotionalUsd(review: unknown): number | undefined {
  const value = recursivelyFindNumber(review, [
    "estimated_total",
    "estimatedTotal",
    "estimated_notional",
    "estimatedNotional",
    "total_cost",
    "totalCost",
    "notional",
    "notional_usd",
  ]);
  return value !== undefined && value > 0 ? value : undefined;
}

function brokerOrderIdFromResult(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = brokerOrderIdFromResult(item);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const explicit = directString(record, ["order_id", "orderId", "broker_order_id"]);
  if (explicit) return explicit;
  for (const [key, nested] of Object.entries(record)) {
    if (
      ["order", "placedorder", "orderresult", "orderresponse"].includes(normalizeKey(key)) &&
      nested &&
      typeof nested === "object" &&
      !Array.isArray(nested)
    ) {
      const id = directString(nested as Record<string, unknown>, ["order_id", "orderId", "id"]);
      if (id) return id;
    }
  }
  for (const nested of Object.values(record)) {
    const found = brokerOrderIdFromResult(nested);
    if (found) return found;
  }
  return undefined;
}

export async function proposeRobinhoodTrade(
  input: ProposeRobinhoodTradeInput
): Promise<TradeDecision> {
  if (!["buy", "sell"].includes(input.side)) throw new Error("Order side must be buy or sell");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Order quantity must be positive");
  }
  if (!Number.isFinite(input.notionalUsd) || input.notionalUsd <= 0) {
    throw new Error("Order notional must be positive");
  }
  if (input.thesis.trim().length < 20) throw new Error("A substantive trade thesis is required");
  if (input.orderType && !["market", "limit"].includes(input.orderType)) {
    throw new Error("Order type must be market or limit");
  }
  if (
    input.orderType === "limit" &&
    (!Number.isFinite(input.limitPrice) || Number(input.limitPrice) <= 0)
  ) {
    throw new Error("Limit orders require a positive limit price");
  }
  const prepared = await serialForWallet(input.wallet, async () => {
    const wallet = input.wallet.toLowerCase();
    const policy = getTradingPolicy(wallet);
    const context = await fetchBrokerContext(wallet, normalizeSymbol(input.symbol));
    const executionPrice =
      input.orderType === "limit" ? input.limitPrice : context.quotePriceUsd;
    if (!executionPrice || !Number.isFinite(executionPrice) || executionPrice <= 0) {
      throw new Error("Unable to derive order notional from a live execution price");
    }
    const derivedNotionalUsd = deriveRobinhoodOrderNotional(input.quantity, executionPrice);
    const intent: OrderIntent = {
      symbol: normalizeSymbol(input.symbol),
      side: input.side,
      quantity: input.quantity,
      notionalUsd: derivedNotionalUsd,
      orderType: input.orderType ?? "market",
      ...(input.limitPrice !== undefined ? { limitPrice: input.limitPrice } : {}),
    };
    const { check } = await policyCheck(wallet, intent, { context });
    let decision = createTradeDecision({
      wallet,
      symbol: intent.symbol,
      side: intent.side,
      thesis: input.thesis.trim(),
      confidence: input.confidence,
      policyVersion: policy.version,
      policyAllowed: check.allowed,
      policyReasons: [...check.reasons, ...check.warnings],
      mode: policy.mode,
      notionalUsd: intent.notionalUsd,
      quantity: intent.quantity,
      orderType: intent.orderType,
      limitPrice: intent.limitPrice,
      timeInForce: input.timeInForce ?? "gfd",
      idempotencyKey: input.idempotencyKey,
      metadata: {
        source: input.source ?? "api",
        requestedNotionalUsd: input.notionalUsd,
        brokerContext: context.raw,
      },
    });
    if (decision.status !== "proposed") return decision;
    if (!check.allowed || !modeAllowsBrokerSubmit(policy.mode)) return decision;

    const tools = await listRobinhoodTools(wallet);
    const reviewTool = findOrderTool(tools, "review");
    const placeTool = findOrderTool(tools, "place");
    const key = decision.idempotencyKey ?? crypto.randomUUID();
    const reviewedIntent = {
      ...intent,
      timeInForce: input.timeInForce ?? "gfd",
    };
    const reviewArguments = orderArguments(
      reviewTool,
      reviewedIntent,
      context.accountId,
      key
    );
    const brokerReviewResult = await callRobinhoodTool(wallet, reviewTool.name, reviewArguments);
    const brokerReview = unwrapRobinhoodToolResult(brokerReviewResult);
    const reviewedNotional = reviewedNotionalUsd(brokerReview);
    if (reviewedNotional) {
      intent.notionalUsd = deriveRobinhoodOrderNotional(
        intent.quantity,
        executionPrice,
        reviewedNotional
      );
      decision = updateDecisionNotional(wallet, decision.id, intent.notionalUsd) ?? decision;
      const reviewedCheck = await policyCheck(wallet, intent, { context });
      updateDecisionPolicy(
        wallet,
        decision.id,
        reviewedCheck.check.allowed,
        [...reviewedCheck.check.reasons, ...reviewedCheck.check.warnings],
        policy.version
      );
      if (!reviewedCheck.check.allowed) {
        return (
          updateDecisionStatus(wallet, decision.id, "failed", {
            from: ["proposed"],
            details: { reason: "broker_review_exceeds_policy" },
            metadata: { brokerReview },
          }) ?? decision
        );
      }
    }
    const placeArguments = orderArguments(
      placeTool,
      reviewedIntent,
      context.accountId,
      key,
      brokerReview
    );
    const envelope: ReviewEnvelope = {
      brokerReview,
      reviewTool: reviewTool.name,
      reviewArguments,
      placeTool: placeTool.name,
      placeArguments,
      reviewedAt: new Date().toISOString(),
    };
    decision =
      updateDecisionReview(wallet, decision.id, envelope, Date.now() + REVIEW_TTL_MS) ??
      decision;
    await notifyTradeEvent("proposal", decision);
    return decision;
  });
  if (prepared.mode === "autonomous" && prepared.status === "reviewed") {
    return approveRobinhoodTrade(input.wallet, prepared.id, true);
  }
  return prepared;
}

export async function approveRobinhoodTrade(
  wallet: string,
  decisionId: number,
  autonomous = false
): Promise<TradeDecision> {
  return serialForWallet(wallet, async () => {
    let decision = getTradeDecision(wallet, decisionId);
    if (!decision) throw new Error("Trade decision not found");
    if (decision.status !== "reviewed") {
      if (["approved", "submitted", "filled"].includes(decision.status)) return decision;
      throw new Error(`Trade cannot be approved from ${decision.status}`);
    }
    if (!robinhoodReviewIsFresh(decision.reviewExpiresAt)) {
      return (
        updateDecisionStatus(wallet, decision.id, "failed", {
          from: ["reviewed"],
          details: { reason: "stale_review" },
          metadata: { error: "Robinhood review expired before approval" },
        }) ?? decision
      );
    }
    const currentPolicy = getTradingPolicy(wallet);
    if (autonomous && currentPolicy.mode !== "autonomous") {
      throw new Error("Autonomous trading is not enabled");
    }
    if (!autonomous && currentPolicy.mode !== "approval") {
      throw new Error("Manual approval is only available in approval mode");
    }
    if (decision.policyVersion !== currentPolicy.version) {
      throw new Error("Trading policy changed after review; create a new proposal");
    }
    const intent = intentFromDecision(decision);
    const context = await fetchBrokerContext(wallet, intent.symbol);
    const freshPrice = intent.orderType === "limit" ? intent.limitPrice : context.quotePriceUsd;
    if (!freshPrice || !Number.isFinite(freshPrice) || freshPrice <= 0) {
      throw new Error("Unable to revalidate order notional from a live execution price");
    }
    intent.notionalUsd = deriveRobinhoodOrderNotional(
      intent.quantity,
      freshPrice,
      Math.max(intent.notionalUsd, reviewedNotionalUsd(decision.review) ?? 0)
    );
    decision = updateDecisionNotional(wallet, decision.id, intent.notionalUsd) ?? decision;
    const { check } = await policyCheck(wallet, intent, {
      context,
      excludeDecisionId: decision.id,
    });
    updateDecisionPolicy(wallet, decision.id, check.allowed, [...check.reasons, ...check.warnings], currentPolicy.version);
    if (!check.allowed) throw new Error(check.reasons.join(" "));
    decision =
      updateDecisionStatus(wallet, decision.id, "approved", {
        from: ["reviewed"],
        details: { autonomous },
      }) ?? decision;
    return submitApprovedTrade(wallet, decision);
  });
}

async function submitApprovedTrade(wallet: string, decision: TradeDecision): Promise<TradeDecision> {
  const review = decision.review as ReviewEnvelope | null;
  if (!review || typeof review.placeTool !== "string" || !asRecord(review.placeArguments)) {
    throw new Error("Stored Robinhood review is incomplete");
  }
  if (!robinhoodReviewIsFresh(decision.reviewExpiresAt)) {
    throw new Error("Robinhood review expired");
  }
  const claimed = claimDecisionSubmission(wallet, decision.id);
  if (!claimed) {
    const current = getTradeDecision(wallet, decision.id);
    if (current && ["submitted", "filled"].includes(current.status)) return current;
    throw new Error("Submission blocked by current policy, connection, kill switch, or stale review");
  }
  try {
    const result = await callRobinhoodTool(
      wallet,
      review.placeTool,
      review.placeArguments,
      { mutation: true }
    );
    const brokerResult = unwrapRobinhoodToolResult(result);
    const brokerOrderId = brokerOrderIdFromResult(brokerResult);
    const brokerStatus =
      recursivelyFindString(brokerResult, ["status", "state", "order_state"]) ?? "submitted";
    const terminalStatus = classifyRobinhoodOrderStatus(brokerStatus) ?? "submitted";
    const updated =
      updateDecisionStatus(wallet, decision.id, terminalStatus, {
        from: ["submitted"],
        brokerOrderId,
        brokerStatus,
        metadata: { brokerResult },
        details: { brokerOrderId, brokerStatus },
      }) ?? claimed;
    await notifyTradeEvent(terminalStatus, updated);
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Robinhood placement failed";
    const ambiguous =
      error instanceof DOMException ||
      /timeout|aborted|network|socket|fetch failed/i.test(message);
    if (ambiguous) {
      const unknown =
        updateDecisionStatus(wallet, decision.id, "submitted", {
          from: ["submitted"],
          brokerStatus: "submission_unknown",
          metadata: { error: message },
          details: { ambiguous: true, error: message },
        }) ?? claimed;
      await notifyTradeEvent("failed", unknown, "Submission result is unknown; reconciliation will verify it.");
      return unknown;
    }
    const failed =
      updateDecisionStatus(wallet, decision.id, "failed", {
        from: ["submitted"],
        brokerStatus: "failed",
        metadata: { error: message },
        details: { error: message },
      }) ?? claimed;
    await notifyTradeEvent("failed", failed, message);
    return failed;
  }
}

export async function rejectRobinhoodTrade(wallet: string, decisionId: number): Promise<TradeDecision> {
  const decision = getTradeDecision(wallet, decisionId);
  if (!decision) throw new Error("Trade decision not found");
  if (decision.status === "rejected") return decision;
  const rejected = updateDecisionStatus(wallet, decisionId, "rejected", {
    from: ["proposed", "reviewed"],
    details: { source: "owner" },
  });
  if (!rejected) throw new Error(`Trade cannot be rejected from ${decision.status}`);
  await notifyTradeEvent("rejected", rejected);
  return rejected;
}

export async function cancelRobinhoodOrder(wallet: string, decisionId: number): Promise<TradeDecision> {
  return serialForWallet(wallet, async () => {
    const decision = getTradeDecision(wallet, decisionId);
    if (!decision) throw new Error("Trade decision not found");
    if (!decision.brokerOrderId) throw new Error("No broker order ID is available");
    if (["cancel_requested", "filled", "cancelled", "failed"].includes(decision.status)) {
      return decision;
    }
    const tools = await listRobinhoodTools(wallet);
    const cancelTool = findOrderTool(tools, "cancel");
    const schema = asRecord(cancelTool.inputSchema);
    const properties = asRecord(schema?.properties) ?? {};
    const args: Record<string, unknown> = {};
    const key =
      Object.keys(properties).find((name) =>
        ["orderid", "id"].includes(normalizeKey(name))
      ) ?? "order_id";
    args[key] = decision.brokerOrderId;
    const cancelResult = unwrapRobinhoodToolResult(
      await callRobinhoodTool(wallet, cancelTool.name, args, { mutation: true })
    );
    const brokerStatus =
      recursivelyFindString(cancelResult, ["status", "state", "order_state"]) ??
      "cancel_requested";
    const terminal = classifyRobinhoodOrderStatus(brokerStatus);
    const nextStatus = terminal ?? "cancel_requested";
    const cancelled =
      updateDecisionStatus(wallet, decision.id, nextStatus, {
        from: ["submitted"],
        brokerStatus,
        metadata: { cancelResult },
        details: { source: "owner", brokerStatus },
      }) ?? decision;
    await notifyTradeEvent(nextStatus, cancelled);
    return cancelled;
  });
}

function matchOrder(
  value: unknown,
  orderId: string | null,
  idempotencyKey: string | null
): { status: string; orderId?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = matchOrder(item, orderId, idempotencyKey);
      if (match) return match;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const id = directString(record, ["order_id", "orderId", "id"]);
  const clientOrderId = directString(record, [
    "client_order_id",
    "clientOrderId",
    "idempotency_key",
  ]);
  if (
    (orderId && id === orderId) ||
    (!orderId && idempotencyKey && clientOrderId === idempotencyKey)
  ) {
    const status =
      directString(record, ["status", "state", "order_state"]) ??
      recursivelyFindString(record, ["status", "state", "order_state"]);
    if (status) return { status, orderId: id };
  }
  for (const nested of Object.values(record)) {
    const match = matchOrder(nested, orderId, idempotencyKey);
    if (match) return match;
  }
  return undefined;
}

export async function reconcileRobinhoodOrders(limit = 100): Promise<{
  checked: number;
  updated: number;
  errors: number;
}> {
  const decisions = listSubmittedTradeDecisions(limit);
  let updated = 0;
  let errors = 0;
  for (const decision of decisions) {
    try {
      await serialForWallet(decision.wallet, async () => {
        const tools = await listRobinhoodTools(decision.wallet);
        const orderTool = findRobinhoodTool(tools, [
          "get_order",
          "get_order_history",
          "get_orders",
          "list_orders",
        ]);
        if (!orderTool) throw new Error("Robinhood order history tool is unavailable");
        const schema = asRecord(orderTool.inputSchema);
        const properties = asRecord(schema?.properties) ?? {};
        const args: Record<string, unknown> = {};
        if (decision.brokerOrderId) {
          const orderKey = Object.keys(properties).find((key) =>
            ["orderid", "id"].includes(normalizeKey(key))
          );
          if (orderKey) args[orderKey] = decision.brokerOrderId;
        }
        const raw = unwrapRobinhoodToolResult(
          await callRobinhoodTool(decision.wallet, orderTool.name, args)
        );
        const match = matchOrder(raw, decision.brokerOrderId, decision.idempotencyKey);
        if (!match) return;
        const target = classifyRobinhoodOrderStatus(match.status);
        if (!target) return;
        const changed = updateDecisionStatus(decision.wallet, decision.id, target, {
          from: ["submitted", "cancel_requested"],
          brokerStatus: match.status,
          brokerOrderId: decision.brokerOrderId ?? match.orderId,
          metadata: { reconciliation: raw },
          details: { source: "reconciliation", brokerStatus: match.status },
        });
        if (changed) {
          updated++;
          await notifyTradeEvent(target === "filled" ? "filled" : target, changed);
        }
      });
    } catch {
      errors++;
    }
  }
  return { checked: decisions.length, updated, errors };
}

async function notifyTradeEvent(
  event: string,
  decision: TradeDecision,
  detail?: string
): Promise<void> {
  try {
    const telegram = await import("@/lib/telegram");
    await telegram.notifyRobinhoodTrade(decision.wallet, event, decision, detail);
  } catch {}
}
