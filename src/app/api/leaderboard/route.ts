import { NextResponse } from "next/server";
import { getRevenueLeaderboard } from "@/lib/leaderboard";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const limit = rateLimit(req, "leaderboard-read", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  return NextResponse.json({ entries: getRevenueLeaderboard(50) });
}
