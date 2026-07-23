import { NextResponse } from "next/server";
import {
  buildX402Requirement,
  isX402Tool,
  recordX402Payment,
  x402PriceUsdg,
} from "@/lib/x402";
import { getPayoutAddress } from "@/lib/data/agent-registry";
import { rateLimit } from "@/lib/rate-limit";
import { requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

/** Quote an x402 pay-per-call requirement for a tool. */
export async function GET(req: Request) {
  const limit = rateLimit(req, "x402-quote", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  const tool = url.searchParams.get("tool")?.trim() || "ask";
  if (!slug || !isX402Tool(tool)) {
    return NextResponse.json(
      { ok: false, error: "slug and a supported tool are required" },
      { status: 400 }
    );
  }
  const requirement = buildX402Requirement(slug, tool);
  if (!requirement) {
    return NextResponse.json(
      {
        ok: false,
        error: "x402 unavailable — business needs a payout address",
        payoutAddress: getPayoutAddress(slug),
        amountUsdg: x402PriceUsdg(slug, tool),
      },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, requirement });
}

/** Confirm a USDG payment and grant one tool credit. */
export async function POST(req: Request) {
  const limit = rateLimit(req, "x402-pay", 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }

  let body: { slug?: string; tool?: string; txHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const slug = body.slug?.trim();
  const tool = body.tool?.trim() || "ask";
  const txHash = body.txHash?.trim();
  if (!slug || !txHash || !isX402Tool(tool)) {
    return NextResponse.json(
      { ok: false, error: "slug, tool, and txHash are required" },
      { status: 400 }
    );
  }

  const result = await recordX402Payment({
    slug,
    tool,
    payer: wallet,
    txHash,
    amountUsdg: x402PriceUsdg(slug, tool),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    credit: { slug, tool, payer: wallet },
    message: `Credit granted for one ${tool} call on ${slug}`,
  });
}
