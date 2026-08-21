import { NextResponse } from "next/server";
import { healOneMissingAvatar, missingAvatarSlugs } from "@/lib/agent-forge";

export const runtime = "nodejs";

/**
 * Avatar backfill ops endpoint, secured by CRON_SECRET.
 * GET reports which agents lack a 3D model; POST forges the next missing one.
 * The scheduler also heals one per tick, so POST is just a manual accelerator.
 */

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, missing: missingAvatarSlugs() });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const before = missingAvatarSlugs();
  if (before.length === 0) {
    return NextResponse.json({ ok: true, forged: null, missing: [] });
  }
  const forged = await healOneMissingAvatar();
  return NextResponse.json({ ok: true, forged, missing: missingAvatarSlugs() });
}
