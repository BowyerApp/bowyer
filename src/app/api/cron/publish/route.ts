import { NextResponse } from "next/server";
import { runScheduledPublish } from "@/lib/scheduler";
import { processTelegramDeliveryQueue, sendDueDailyBriefings } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Secured cron endpoint for scheduled publishing.
 * Set CRON_SECRET and call with Authorization: Bearer <secret>.
 * Railway / external cron: hit every 15 minutes.
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

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? undefined;

  const result = await runScheduledPublish(slug);
  const briefingsSent = slug ? 0 : await sendDueDailyBriefings();
  const delivery = await processTelegramDeliveryQueue();
  return NextResponse.json({ ok: true, ...result, briefingsSent, delivery });
}

export async function GET(req: Request) {
  return POST(req);
}
