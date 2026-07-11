import { NextResponse } from "next/server";
import { runScheduledPublish } from "@/lib/scheduler";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Secured cron endpoint for scheduled publishing.
 * Set CRON_SECRET and call with Authorization: Bearer <secret>.
 * Railway / external cron: hit every 15 minutes.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? undefined;

  const result = await runScheduledPublish(slug);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return POST(req);
}
