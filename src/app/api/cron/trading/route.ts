import { NextResponse } from "next/server";
import { tradingTick } from "@/lib/trading/engine";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Secured cron endpoint to drive the trading engine on multi-instance or
 * serverless deploys where the in-process interval can't be relied on.
 * Set CRON_SECRET and call with Authorization: Bearer <secret>.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is required" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await tradingTick();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return POST(req);
}
