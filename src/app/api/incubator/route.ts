import { NextResponse } from "next/server";
import {
  castIncubatorVote,
  countBirths,
  getOpenVotingRun,
  incubatorEnabled,
  listIncubatorRuns,
} from "@/lib/incubator";
import { rateLimit } from "@/lib/rate-limit";
import { requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

/** Public incubator state: live pipeline runs + the open holder vote. */
export async function GET(req: Request) {
  const limit = rateLimit(req, "incubator-read", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  return NextResponse.json({
    enabled: incubatorEnabled(),
    births: countBirths(),
    voting: getOpenVotingRun(),
    runs: listIncubatorRuns(20),
  });
}

/**
 * Operator-only (Bearer CRON_SECRET): force an incubator cycle step, or
 * rewrite the latest memo in place with `?action=rewrite-memo`.
 */
export async function PUT(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const action = new URL(req.url).searchParams.get("action");
  if (action === "rewrite-memo") {
    const { rewriteLatestMemo } = await import("@/lib/incubator");
    return NextResponse.json(await rewriteLatestMemo());
  }
  const { runIncubatorCycle } = await import("@/lib/incubator");
  const result = await runIncubatorCycle();
  return NextResponse.json(result);
}

/** Cast a holder-weighted vote for the next birth. Body: { runId, wallet, repo } */
export async function POST(req: Request) {
  const limit = rateLimit(req, "incubator-vote", 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const runId = Number(body.runId);
  const wallet = String(body.wallet ?? "").trim();
  const repo = String(body.repo ?? "").trim();
  if (!Number.isFinite(runId) || !/^0x[0-9a-fA-F]{40}$/.test(wallet) || !repo) {
    return NextResponse.json(
      { ok: false, error: "runId, wallet, and repo are required" },
      { status: 400 }
    );
  }
  if (!requireWalletSession(req, wallet)) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }

  const result = await castIncubatorVote(runId, wallet, repo);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, weight: result.weight });
}
