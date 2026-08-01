import { NextResponse } from "next/server";
import { getWalletSummary } from "@/lib/market-data";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const limit = rateLimit(req, "market-wallet", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const { address } = await params;
  try {
    const summary = await getWalletSummary(address);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Wallet lookup failed" },
      { status: 400 }
    );
  }
}
