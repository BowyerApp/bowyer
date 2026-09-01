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
  // Flush any queued fomo-feed theses (no-ops until a write path is configured).
  const fomoTheses = await (async () => {
    try {
      const { flushFomoTheses } = await import("@/lib/trading/fomo-thesis");
      return await flushFomoTheses();
    } catch {
      return { enabled: false, attempted: 0, posted: 0, pending: 0 };
    }
  })();
  // Social presence: refresh thesis-style exemplars and discover/follow traders.
  // Throttled to roughly every 3 hours so we don't hammer the fomo API each tick.
  const fomoSocial = await (async () => {
    if (slug) return { skipped: true };
    try {
      const { kvGet, kvSet } = await import("@/lib/trading/store");
      const last = Number(kvGet("fomo_social_last_run") ?? 0);
      if (Date.now() - last < 3 * 60 * 60 * 1000) return { skipped: true };
      const { studyTheses, discoverAndFollow } = await import("@/lib/trading/fomo-social");
      const exemplars = await studyTheses();
      const discovery = await discoverAndFollow();
      kvSet("fomo_social_last_run", String(Date.now()));
      return { exemplars: exemplars.length, discovery };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  })();
  return NextResponse.json({ ok: true, ...result, briefingsSent, delivery, fomoTheses, fomoSocial });
}

export async function GET(req: Request) {
  return POST(req);
}
