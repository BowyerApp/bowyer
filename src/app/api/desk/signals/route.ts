import { NextResponse } from "next/server";
import { getDeskSignals, getPremiumHistory, DISLOCATION_THRESHOLD_PCT } from "@/lib/desk-signals";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Active premium/discount signals for the HOOD DESK board.
 * ?symbol=TSLAx also returns that token's recent premium history.
 */
export async function GET(req: Request) {
  const limit = rateLimit(req, "desk-signals", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim();
  const signals = getDeskSignals();
  return NextResponse.json({
    ok: true,
    product: "HOOD DESK",
    thresholdPct: DISLOCATION_THRESHOLD_PCT,
    count: signals.length,
    signals,
    ...(symbol ? { history: getPremiumHistory(symbol) } : {}),
  });
}
