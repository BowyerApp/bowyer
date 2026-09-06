import { NextResponse } from "next/server";
import {
  createTradeDecision,
  getTradingPolicy,
  listTradeDecisions,
} from "@/lib/robinhood-trading";
import {
  approveRobinhoodTrade,
  cancelRobinhoodOrder,
  proposeRobinhoodTrade,
  rejectRobinhoodTrade,
} from "@/lib/robinhood-executor";
import { normalizeSymbol } from "@/lib/trading-policy";
import { requireWalletSession } from "@/lib/wallet-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const limit = rateLimit(req, "trading-decisions-read", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }
  const limitParam = Number(new URL(req.url).searchParams.get("limit") ?? 20);
  return NextResponse.json({ ok: true, decisions: listTradeDecisions(wallet, limitParam) });
}

export async function POST(req: Request) {
  const limit = rateLimit(req, "trading-decisions-write", 15, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }

  let body: {
    symbol?: string;
    side?: "buy" | "sell" | "hold";
    thesis?: string;
    confidence?: number;
    quantity?: number;
    notionalUsd?: number;
    orderType?: "market" | "limit";
    limitPrice?: number;
    timeInForce?: string;
    idempotencyKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const symbol = normalizeSymbol(String(body.symbol ?? ""));
  const side = body.side ?? "hold";
  const thesis = String(body.thesis ?? "").trim();
  if (!symbol || !thesis) {
    return NextResponse.json({ ok: false, error: "symbol and thesis required" }, { status: 400 });
  }
  if (!["buy", "sell", "hold"].includes(side)) {
    return NextResponse.json({ ok: false, error: "side must be buy, sell, or hold" }, { status: 400 });
  }

  const policy = getTradingPolicy(wallet);
  if (side === "hold") {
    const decision = createTradeDecision({
      wallet,
      symbol,
      side,
      thesis,
      confidence: body.confidence,
      policyVersion: policy.version,
      policyAllowed: true,
      policyReasons: ["Hold — no order submitted."],
      mode: policy.mode,
      idempotencyKey: body.idempotencyKey ?? req.headers.get("idempotency-key") ?? undefined,
    });
    return NextResponse.json({ ok: true, decision });
  }
  const quantity = Number(body.quantity);
  const notionalUsd = Number(body.notionalUsd);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    return NextResponse.json(
      { ok: false, error: "Positive quantity and notionalUsd are required" },
      { status: 400 }
    );
  }
  if (body.orderType === "limit" && (!Number.isFinite(body.limitPrice) || Number(body.limitPrice) <= 0)) {
    return NextResponse.json({ ok: false, error: "limitPrice is required for limit orders" }, { status: 400 });
  }
  try {
    const decision = await proposeRobinhoodTrade({
      wallet,
      symbol,
      side,
      thesis,
      confidence: body.confidence,
      quantity,
      notionalUsd,
      orderType: body.orderType ?? "market",
      limitPrice: body.limitPrice,
      timeInForce: body.timeInForce,
      idempotencyKey: body.idempotencyKey ?? req.headers.get("idempotency-key") ?? undefined,
      source: "web",
    });
    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Trade proposal failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request) {
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }
  let body: { id?: number; action?: "approve" | "reject" | "cancel" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const id = Number(body.id);
  if (!id || !body.action) {
    return NextResponse.json({ ok: false, error: "id and action required" }, { status: 400 });
  }
  try {
    const decision =
      body.action === "approve"
        ? await approveRobinhoodTrade(wallet, id)
        : body.action === "cancel"
          ? await cancelRobinhoodOrder(wallet, id)
          : await rejectRobinhoodTrade(wallet, id);
    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Decision update failed" },
      { status: 409 }
    );
  }
}
