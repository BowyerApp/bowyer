import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { STRATEGY_META, leaderboard } from "@/lib/trading/store";

export const runtime = "nodejs";

/**
 * Public verified-PnL leaderboard. Every number is derived from recorded
 * fills and equity snapshots — no self-reported figures. Owners appear as
 * shortened addresses; live agents also expose their trading wallet address
 * so anyone can verify every fill on-chain.
 */
export async function GET(req: Request) {
  const limit = rateLimit(req, "trading-leaderboard", 60, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });

  const rows = leaderboard(50).map((r) => ({
    ...r,
    strategyName: STRATEGY_META[r.strategy].name,
    style: STRATEGY_META[r.strategy].style,
  }));
  return NextResponse.json(
    { ok: true, leaderboard: rows, generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
