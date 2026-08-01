import { NextResponse } from "next/server";
import { getMemeScreener, getEquityScreener } from "@/lib/market-data";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const limit = rateLimit(req, "market-screener", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const view = new URL(req.url).searchParams.get("view");
  try {
    const data = view === "equities" ? await getEquityScreener() : await getMemeScreener();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Screener unavailable" },
      { status: 500 }
    );
  }
}
