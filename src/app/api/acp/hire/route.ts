import { NextResponse } from "next/server";
import { ensureDefaultAcpOfferings, getAcpOffering } from "@/lib/acp-offerings";
import {
  buildX402Requirement,
  consumeX402Credit,
  hasUnconsumedX402Credit,
  isX402Tool,
  recordX402Payment,
  releaseX402Credit,
  x402PriceUsdg,
} from "@/lib/x402";
import { getOrCreateMcpServer, handleMcpJsonRpc } from "@/lib/mcp-server";
import { GITHUB_REPOS, getAgentSummary } from "@/lib/data/agents";
import { getRegisteredDescription, hasSubscription } from "@/lib/data/agent-registry";
import { rateLimit } from "@/lib/rate-limit";
import { requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

/**
 * ACP-style hire endpoint: run one offering tool and return the deliverable.
 * Settlement: active subscription OR x402 USDG credit / X-PAYMENT-TX header.
 */
export async function POST(req: Request) {
  const limit = rateLimit(req, "acp-hire", 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  ensureDefaultAcpOfferings();

  let body: {
    slug?: string;
    tool?: string;
    arguments?: Record<string, unknown>;
    txHash?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const slug = body.slug?.trim();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
  }

  const offering = getAcpOffering(slug);
  const agent = getAgentSummary(slug);
  if (!offering || !agent) {
    return NextResponse.json({ ok: false, error: "Offering not found" }, { status: 404 });
  }

  const tool = body.tool?.trim() || offering.serviceTool;
  if (!isX402Tool(tool) && tool !== offering.serviceTool) {
    return NextResponse.json({ ok: false, error: "Unsupported tool for hire" }, { status: 400 });
  }

  const wallet = requireWalletSession(req);
  const isPaid = agent.pricing.model !== "free" && agent.pricing.amount > 0;
  const subscribed = wallet ? hasSubscription(slug, wallet) : false;

  // Claimed x402 credit for this hire — refunded if the job errors.
  let x402CreditId: number | null = null;

  if (isPaid && !subscribed) {
    if (!wallet) {
      const requirement = buildX402Requirement(slug, tool);
      return NextResponse.json(
        {
          ok: false,
          error: "Wallet session required for paid hire",
          x402: requirement,
        },
        { status: 401 }
      );
    }
    const paymentTx =
      body.txHash?.trim() ||
      req.headers.get("x-payment-tx")?.trim() ||
      req.headers.get("x-bowyer-payment-tx")?.trim();
    if (paymentTx) {
      const recorded = await recordX402Payment({
        slug,
        tool,
        payer: wallet,
        txHash: paymentTx,
        amountUsdg: x402PriceUsdg(slug, tool),
      });
      // A stale/reused header must not block a caller who already holds a
      // valid credit (e.g. a retry after an error refunded their credit).
      if (!recorded.ok && !hasUnconsumedX402Credit(slug, wallet, tool)) {
        return NextResponse.json(
          { ok: false, error: recorded.reason, x402: buildX402Requirement(slug, tool) },
          { status: 402 }
        );
      }
    }
    x402CreditId = consumeX402Credit(slug, wallet, tool);
    if (x402CreditId == null) {
      return NextResponse.json(
        {
          ok: false,
          error: "Pay with USDG (x402) or subscribe on bowyer.app",
          x402: buildX402Requirement(slug, tool),
        },
        { status: 402 }
      );
    }
  }

  const server = getOrCreateMcpServer({
    slug,
    name: agent.name,
    version: agent.version,
    tagline: agent.tagline,
    description: getRegisteredDescription(slug) ?? agent.thesis,
    githubRepo: GITHUB_REPOS[slug],
  });

  const jobId = `acp-${Date.now().toString(36)}`;
  const started = Date.now();
  const response = await handleMcpJsonRpc(server, {
    jsonrpc: "2.0",
    method: "tools/call",
    id: 1,
    params: { name: tool, arguments: body.arguments ?? {} },
  });

  const content =
    "result" in response
      ? (response.result as { content?: { type: string; text?: string }[] })?.content
      : undefined;
  const text = content?.find((c) => c.type === "text")?.text ?? "";

  if ("error" in response && !("result" in response)) {
    // The paid job never ran — give the credit back.
    if (x402CreditId != null) releaseX402Credit(x402CreditId);
    return NextResponse.json(
      { ok: false, jobId, error: response.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    jobId,
    phase: "completed",
    offering: {
      slug,
      tool,
      title: offering.title,
      priceUsdg: offering.priceUsdg,
    },
    durationMs: Date.now() - started,
    deliverable: {
      mimeType: "text/markdown",
      text,
    },
  });
}
