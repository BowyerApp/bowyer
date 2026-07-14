import { NextResponse } from "next/server";
import {
  createTradeDecision,
  dailyTradeStats,
  getTradingPolicy,
  listTradeDecisions,
  updateDecisionStatus,
} from "@/lib/robinhood-trading";
import { evaluatePolicy, normalizeSymbol, type OrderIntent } from "@/lib/trading-policy";
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

  const policy = getTradingPolicy(wallet);
  const stats = dailyTradeStats(wallet);
  const intent: OrderIntent = {
    symbol,
    side: side === "hold" ? "buy" : side,
    quantity: Number(body.quantity ?? 1),
    notionalUsd: Number(body.notionalUsd ?? 0),
    orderType: body.orderType ?? "market",
  };
  const check =
    side === "hold"
      ? { allowed: true, reasons: [], warnings: ["Hold — no order intent evaluated."] }
      : evaluatePolicy(policy, intent, {
          dailyTrades: stats.trades,
          dailyRealizedLossUsd: stats.realizedLossUsd,
        });

  const decision = createTradeDecision({
    wallet,
    symbol,
    side,
    thesis,
    confidence: body.confidence,
    policyVersion: policy.version,
    policyAllowed: check.allowed,
    policyReasons: check.reasons,
    mode: policy.mode,
    notionalUsd: intent.notionalUsd || undefined,
    metadata: { warnings: check.warnings, orderType: intent.orderType },
  });

  return NextResponse.json({ ok: true, decision, policyCheck: check });
}

export async function PATCH(req: Request) {
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }
  let body: { id?: number; action?: "approve" | "reject" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const id = Number(body.id);
  if (!id || !body.action) {
    return NextResponse.json({ ok: false, error: "id and action required" }, { status: 400 });
  }
  const status = body.action === "approve" ? "approved" : "rejected";
  const decision = updateDecisionStatus(wallet, id, status);
  if (!decision) {
    return NextResponse.json({ ok: false, error: "Decision not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, decision });
}
