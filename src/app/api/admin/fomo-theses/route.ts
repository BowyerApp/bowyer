import { NextResponse } from "next/server";
import { markThesisFomoPosted, pendingFomoTheses } from "@/lib/trading/store";

export const runtime = "nodejs";

/**
 * Bridge for the fomo-automation browser worker (CRON_SECRET-gated).
 *
 * GET  -> pending fomo-feed theses the worker still needs to post.
 * POST { id } -> mark one thesis as posted once the worker confirms it.
 *
 * The worker runs a persistent, logged-in Playwright session (see
 * /fomo-automation) and drives fomo's real UI, so it inherits the browser's
 * self-refreshing Privy session instead of a rotating API token.
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
  const url = new URL(req.url);
  if (url.searchParams.get("ping") === "1") {
    const { fomoThesisPing } = await import("@/lib/trading/fomo-thesis");
    return NextResponse.json(await fomoThesisPing());
  }
  const social = url.searchParams.get("social");
  if (social === "study") {
    const { studyTheses } = await import("@/lib/trading/fomo-social");
    return NextResponse.json({ ok: true, exemplars: await studyTheses() });
  }
  if (social === "discover") {
    const { discoverAndFollow } = await import("@/lib/trading/fomo-social");
    const max = Math.min(Math.max(Number(url.searchParams.get("max") ?? 12), 1), 30);
    return NextResponse.json(await discoverAndFollow(max));
  }
  if (social === "tracked") {
    const { trackedTraders } = await import("@/lib/trading/store");
    return NextResponse.json({ ok: true, tracked: trackedTraders(50) });
  }
  if (social === "dedupe") {
    // One-shot cleanup: keep the earliest thesis per (agent, tx) — later
    // duplicates came from a bug where skipped orders re-processed old fills.
    const { db } = await import("@/lib/db");
    const r = db()
      .prepare(
        `DELETE FROM trading_theses WHERE id NOT IN (
           SELECT id FROM (
             SELECT id, ROW_NUMBER() OVER (PARTITION BY agent_id, tx_hash ORDER BY at ASC) AS rn
             FROM trading_theses WHERE tx_hash IS NOT NULL AND tx_hash != ''
           ) WHERE rn = 1
         ) AND tx_hash IS NOT NULL AND tx_hash != ''`
      )
      .run();
    return NextResponse.json({ ok: true, deleted: r.changes });
  }
  if (social === "backfill") {
    const { backfillFomoTheses } = await import("@/lib/trading/fomo-social");
    const { flushFomoTheses } = await import("@/lib/trading/fomo-thesis");
    const backfill = await backfillFomoTheses();
    const flush = await flushFomoTheses();
    return NextResponse.json({ ok: true, backfill, flush });
  }
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 50);
  const pending = pendingFomoTheses(limit).map((t) => ({
    id: t.id,
    token: t.token,
    symbol: t.symbol,
    side: t.side,
    thesis: t.thesis,
    txHash: t.txHash,
    valueUsd: t.valueUsd,
    at: t.at,
  }));
  return NextResponse.json({ ok: true, pending });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  markThesisFomoPosted(id);
  return NextResponse.json({ ok: true });
}
