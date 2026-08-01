import { NextResponse } from "next/server";
import { getTokenDetail } from "@/lib/market-data";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const limit = rateLimit(req, "market-token", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const { address } = await params;
  try {
    const detail = await getTokenDetail(address);
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Token detail unavailable" },
      { status: 400 }
    );
  }
}
