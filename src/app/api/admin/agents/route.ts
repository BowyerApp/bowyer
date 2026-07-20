import { NextResponse } from "next/server";
import {
  removeRegisteredAgent,
  getRegisteredAgent,
  setAgentListed,
} from "@/lib/data/agent-registry";

export const runtime = "nodejs";

/**
 * Admin maintenance endpoint, secured the same way as /api/cron/publish:
 * requires Authorization: Bearer <CRON_SECRET>.
 *
 * DELETE /api/admin/agents?slug=<slug> — permanently remove a launched agent
 * and all its data. Built-in catalog agents cannot be removed here.
 * PATCH  /api/admin/agents?slug=<slug>&listed=0|1 — hide or restore a business
 * on the marketplace without deleting its data. Unlisted businesses also stop
 * scheduled publishing.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function DELETE(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is required" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
  }
  if (!getRegisteredAgent(slug)) {
    return NextResponse.json(
      { ok: false, error: "Not a launched agent (built-in agents cannot be removed)" },
      { status: 404 }
    );
  }
  const removed = removeRegisteredAgent(slug);
  return NextResponse.json({ ok: removed, slug });
}

export async function PATCH(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is required" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  const listedParam = url.searchParams.get("listed")?.trim();
  if (!slug || (listedParam !== "0" && listedParam !== "1")) {
    return NextResponse.json(
      { ok: false, error: "slug and listed=0|1 are required" },
      { status: 400 }
    );
  }
  if (!getRegisteredAgent(slug)) {
    return NextResponse.json(
      { ok: false, error: "Not a launched agent (built-in agents cannot be unlisted)" },
      { status: 404 }
    );
  }
  const changed = setAgentListed(slug, listedParam === "1");
  return NextResponse.json({ ok: changed, slug, listed: listedParam === "1" });
}
