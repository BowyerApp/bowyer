import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forgeAgentModel, forgedModelPath, getAgentAvatarGlbFromDb } from "@/lib/agent-forge";
import { AGENT_AVATAR_GLB } from "@/lib/agent-avatars";
import { agentSummaries } from "@/lib/data/agents";

export const runtime = "nodejs";

/**
 * Backfill 3D avatars for businesses whose launch-time forge failed.
 * Secured by CRON_SECRET. POST kicks off a sequential background run;
 * GET reports which agents still lack a model.
 */

let running = false;
let lastRun: { startedAt: string; queued: string[]; done: string[]; failed: string[] } | null = null;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

function fileExists(path: string): boolean {
  try {
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    return fs.existsSync(path);
  } catch {
    return false;
  }
}

/** DB businesses whose avatar is unset or whose model file is gone from the volume. */
function missingAvatarSlugs(): string[] {
  const rows = db()
    .prepare("SELECT slug FROM agents")
    .all() as { slug: string }[];
  const dbMissing = rows
    .map((r) => r.slug)
    .filter((slug) => {
      const stored = getAgentAvatarGlbFromDb(slug);
      if (!stored) return true;
      // Stored URL points at the data volume — confirm the file survived.
      if (stored.startsWith("/api/models/")) return !fileExists(forgedModelPath(slug));
      return false;
    });
  // Catalog agents without a bundled GLB get forged onto the volume too.
  const catalogMissing = agentSummaries
    .map((a) => a.slug)
    .filter((slug) => !AGENT_AVATAR_GLB[slug] && !fileExists(forgedModelPath(slug)));
  return [...new Set([...dbMissing, ...catalogMissing])];
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, running, missing: missingAvatarSlugs(), lastRun });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (running) {
    return NextResponse.json({ ok: false, error: "Backfill already running", lastRun }, { status: 409 });
  }

  const queued = missingAvatarSlugs();
  if (queued.length === 0) {
    return NextResponse.json({ ok: true, queued: [], message: "Nothing to backfill" });
  }

  running = true;
  const run = { startedAt: new Date().toISOString(), queued, done: [] as string[], failed: [] as string[] };
  lastRun = run;

  // Sequential on purpose: three.ws jobs take minutes and parallel runs starve each other.
  void (async () => {
    try {
      for (const slug of queued) {
        const row = db()
          .prepare("SELECT summary FROM agents WHERE slug = ?")
          .get(slug) as { summary: string | null } | undefined;
        const catalog = agentSummaries.find((a) => a.slug === slug);
        let name = catalog?.name ?? slug;
        let tagline = catalog?.tagline ?? "autonomous business";
        let category = catalog?.category ?? "research";
        try {
          const parsed = JSON.parse(row?.summary ?? "{}") as {
            name?: string;
            tagline?: string;
            category?: string;
          };
          if (parsed.name) name = parsed.name;
          if (parsed.tagline) tagline = parsed.tagline;
          if (parsed.category) category = parsed.category;
        } catch {
          /* defaults hold */
        }
        const url = await forgeAgentModel({ slug, name, tagline, category });
        if (url) run.done.push(slug);
        else run.failed.push(slug);
      }
    } finally {
      running = false;
    }
  })();

  return NextResponse.json({ ok: true, queued, message: "Backfill started in background" });
}
