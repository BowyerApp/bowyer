import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  classifyRobinhoodOrderStatus,
  createRobinhoodPkce,
  deriveRobinhoodOrderNotional,
  parseMcpResponseBody,
  robinhoodReviewIsFresh,
} from "../src/lib/robinhood-protocol.ts";
import { evaluatePolicy } from "../src/lib/trading-policy.ts";

process.env.ROBINHOOD_ROLLOUT_STAGE = "approval";

const policy = {
  wallet: "0x0000000000000000000000000000000000000001",
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
  updatedAt: new Date(0).toISOString(),
};

test("PKCE challenge is SHA-256 of verifier", () => {
  const { verifier, challenge } = createRobinhoodPkce();
  assert.ok(verifier.length >= 43);
  assert.equal(createHash("sha256").update(verifier).digest("base64url"), challenge);
});

test("MCP parser accepts JSON and Streamable HTTP SSE", () => {
  assert.deepEqual(parseMcpResponseBody('{"result":{"ok":true}}', "application/json"), {
    result: { ok: true },
  });
  assert.deepEqual(
    parseMcpResponseBody(
      'event: message\ndata: {"jsonrpc":"2.0","result":{"tools":[]}}\n\n',
      "text/event-stream"
    ),
    { jsonrpc: "2.0", result: { tools: [] } }
  );
  assert.deepEqual(
    parseMcpResponseBody(
      [
        'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}',
        "",
        'event: message\ndata: {"jsonrpc":\ndata: "2.0","id":"wanted","result":{"ok":true}}',
        "",
      ].join("\n"),
      "text/event-stream",
      "wanted"
    ),
    { jsonrpc: "2.0", id: "wanted", result: { ok: true } }
  );
});

test("stale reviews and broker terminal states are deterministic", () => {
  assert.equal(robinhoodReviewIsFresh(2_000, 1_999), true);
  assert.equal(robinhoodReviewIsFresh(2_000, 2_001), false);
  assert.equal(classifyRobinhoodOrderStatus("partially_filled"), null);
  assert.equal(classifyRobinhoodOrderStatus("cancelled"), "cancelled");
  assert.equal(classifyRobinhoodOrderStatus("rejected"), "failed");
  assert.equal(classifyRobinhoodOrderStatus("queued"), null);
});

test("executable quantity and price determine policy notional", () => {
  assert.equal(deriveRobinhoodOrderNotional(100, 25, 100), 2_500);
  assert.equal(deriveRobinhoodOrderNotional(1, 25, 30), 30);
  assert.throws(() => deriveRobinhoodOrderNotional(100, Number.NaN, 1));
});

test("policy enforces order, concentration, loss, reserve, and stale quote limits", () => {
  const result = evaluatePolicy(
    policy,
    { symbol: "AAPL", side: "buy", quantity: 10, notionalUsd: 600, orderType: "market" },
    {
      dailyTrades: 5,
      dailyRealizedLossUsd: 250,
      openConcentrationUsd: 2_100,
      buyingPowerUsd: 1_000,
      connectionStatus: "linked",
      marketOpen: true,
      tradable: true,
      quoteAgeMs: 31_000,
    }
  );
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.length >= 5);
});

test("sell orders do not increase concentration or consume cash reserve", () => {
  const result = evaluatePolicy(
    policy,
    { symbol: "AAPL", side: "sell", quantity: 1, notionalUsd: 100, orderType: "market" },
    {
      dailyTrades: 0,
      dailyRealizedLossUsd: 0,
      openConcentrationUsd: 2_500,
      buyingPowerUsd: 0,
      connectionStatus: "linked",
      marketOpen: true,
      tradable: true,
      quoteAgeMs: 1_000,
    }
  );
  assert.equal(result.allowed, true);
});

test("global trading kill switch fails closed", () => {
  process.env.ROBINHOOD_TRADING_DISABLED = "1";
  try {
    const result = evaluatePolicy(
      policy,
      { symbol: "AAPL", side: "buy", quantity: 1, notionalUsd: 100, orderType: "market" },
      {
        dailyTrades: 0,
        dailyRealizedLossUsd: 0,
        openConcentrationUsd: 0,
        buyingPowerUsd: 10_000,
        connectionStatus: "linked",
        marketOpen: true,
        tradable: true,
        quoteAgeMs: 1_000,
      }
    );
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.some((reason) => reason.includes("disabled globally")));
  } finally {
    delete process.env.ROBINHOOD_TRADING_DISABLED;
  }
});

test("read-only rollout blocks live approval orders", () => {
  process.env.ROBINHOOD_ROLLOUT_STAGE = "read_only";
  try {
    const result = evaluatePolicy(
      policy,
      { symbol: "AAPL", side: "buy", quantity: 1, notionalUsd: 100, orderType: "market" },
      {
        dailyTrades: 0,
        dailyRealizedLossUsd: 0,
        openConcentrationUsd: 0,
        buyingPowerUsd: 10_000,
        connectionStatus: "linked",
        marketOpen: true,
        tradable: true,
        quoteAgeMs: 1_000,
      }
    );
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.some((reason) => reason.includes("rollout stage")));
  } finally {
    process.env.ROBINHOOD_ROLLOUT_STAGE = "approval";
  }
});
