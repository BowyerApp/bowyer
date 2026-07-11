import { NextResponse } from "next/server";
import {
  cancelSubscription,
  getPayoutAddress,
  hasSubscription,
  isTxHashUsed,
  listEarnings,
  listSubscriptions,
  recordSubscription,
} from "@/lib/data/agent-registry";
import { getAgentSummary } from "@/lib/data/agents";
import { verifyPayment } from "@/lib/verify-payment";

export const runtime = "nodejs";

/**
 * List subscriptions.
 * ?subscriber=0x… → subscriptions this wallet bought
 * ?creator=0x…    → payments received by businesses this wallet owns
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const subscriber = searchParams.get("subscriber") ?? undefined;
  const creator = searchParams.get("creator") ?? undefined;
  if (creator) {
    return NextResponse.json({ subscriptions: listEarnings(creator) });
  }
  return NextResponse.json({ subscriptions: listSubscriptions(subscriber) });
}

/**
 * Record a subscription. Free agents subscribe directly; paid agents must
 * include the txHash of the payment to the creator's payout address.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim();
  const subscriber = String(body.subscriber ?? "").trim();
  const txHash = body.txHash ? String(body.txHash).trim() : undefined;

  if (!slug || !/^0x[0-9a-fA-F]{40}$/.test(subscriber)) {
    return NextResponse.json(
      { ok: false, error: "slug and a valid subscriber address are required" },
      { status: 400 }
    );
  }

  const agent = getAgentSummary(slug);
  if (!agent) {
    return NextResponse.json({ ok: false, error: "Unknown agent" }, { status: 404 });
  }

  if (hasSubscription(slug, subscriber)) {
    return NextResponse.json({ ok: true, alreadySubscribed: true });
  }

  const isFree = agent.pricing.model === "free" || agent.pricing.amount <= 0;
  const payoutAddress = getPayoutAddress(slug);

  if (!isFree && !txHash) {
    return NextResponse.json(
      {
        ok: false,
        error: "Paid subscription requires a payment transaction",
        payoutAddress,
        amountUsd: agent.pricing.amount,
      },
      { status: 402 }
    );
  }

  // Paid path: verify the payment actually happened on chain before recording.
  if (!isFree && txHash) {
    if (!payoutAddress) {
      return NextResponse.json(
        { ok: false, error: "This business has no payout address configured" },
        { status: 400 }
      );
    }
    if (isTxHashUsed(txHash)) {
      return NextResponse.json(
        { ok: false, error: "This transaction was already used for a subscription" },
        { status: 409 }
      );
    }
    const verification = await verifyPayment({
      txHash,
      from: subscriber,
      to: payoutAddress,
      amountUsd: agent.pricing.amount,
    });
    if (!verification.ok) {
      return NextResponse.json(
        { ok: false, error: `Payment verification failed: ${verification.reason}` },
        { status: 402 }
      );
    }
  }

  recordSubscription({
    slug,
    subscriber,
    txHash,
    amountUsd: isFree ? 0 : agent.pricing.amount,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, payoutAddress });
}

/** Cancel an active subscription. Body: { slug, subscriber } */
export async function DELETE(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim();
  const subscriber = String(body.subscriber ?? "").trim();
  if (!slug || !/^0x[0-9a-fA-F]{40}$/.test(subscriber)) {
    return NextResponse.json(
      { ok: false, error: "slug and a valid subscriber address are required" },
      { status: 400 }
    );
  }

  const cancelled = cancelSubscription(slug, subscriber);
  if (!cancelled) {
    return NextResponse.json(
      { ok: false, error: "No active subscription found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
