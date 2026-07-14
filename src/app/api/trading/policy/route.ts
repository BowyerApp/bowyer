import { NextResponse } from "next/server";
import { getRobinhoodConnection, getTradingPolicy, saveTradingPolicy } from "@/lib/robinhood-trading";
import type { TradingMode } from "@/lib/trading-policy";
import { requireWalletSession } from "@/lib/wallet-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const limit = rateLimit(req, "trading-policy-read", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }
  const connection = getRobinhoodConnection(wallet);
  const policy = getTradingPolicy(wallet);
  return NextResponse.json({ ok: true, connection, policy });
}

export async function PUT(req: Request) {
  const limit = rateLimit(req, "trading-policy-write", 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const current = getTradingPolicy(wallet);
  const nextMode = String(body.mode ?? current.mode) as TradingMode;
  const validModes: TradingMode[] = ["research", "simulate", "paper", "approval", "autonomous"];
  if (!validModes.includes(nextMode)) {
    return NextResponse.json({ ok: false, error: "Invalid trading mode" }, { status: 400 });
  }
  if (nextMode === "autonomous" && body.autonomousAck !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Autonomous mode requires explicit acknowledgement of trading risk.",
      },
      { status: 400 }
    );
  }

  const allowedSymbols = Array.isArray(body.allowedSymbols)
    ? (body.allowedSymbols as string[]).map((s) => s.trim().toUpperCase()).filter(Boolean)
    : current.allowedSymbols;

  const policy = saveTradingPolicy({
    ...current,
    mode: nextMode,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : current.enabled,
    killSwitch: body.killSwitch !== undefined ? Boolean(body.killSwitch) : current.killSwitch,
    maxOrderUsd: Number(body.maxOrderUsd ?? current.maxOrderUsd),
    maxPositionUsd: Number(body.maxPositionUsd ?? current.maxPositionUsd),
    maxDailyLossUsd: Number(body.maxDailyLossUsd ?? current.maxDailyLossUsd),
    maxDailyTrades: Number(body.maxDailyTrades ?? current.maxDailyTrades),
    cashReserveUsd: Number(body.cashReserveUsd ?? current.cashReserveUsd),
    allowedSymbols,
    strategyNotes: String(body.strategyNotes ?? current.strategyNotes),
  });

  return NextResponse.json({ ok: true, policy });
}
