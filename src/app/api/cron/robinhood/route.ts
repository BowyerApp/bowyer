import { NextResponse } from "next/server";
import { reconcileRobinhoodOrders } from "@/lib/robinhood-executor";
import { runRobinhoodHouseBot } from "@/lib/robinhood-house-bot";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is required" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const reconciliation = await reconcileRobinhoodOrders();
  const houseBot =
    process.env.ROBINHOOD_HOUSE_BOT_ENABLED === "1"
      ? await runRobinhoodHouseBot()
      : { skipped: "disabled" };
  return NextResponse.json({ ok: true, reconciliation, houseBot });
}

export async function GET(req: Request) {
  return POST(req);
}
