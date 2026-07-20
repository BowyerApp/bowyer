import { NextResponse } from "next/server";
import {
  getAgentOwnerAddress,
  getRegisteredAgent,
  updateRegisteredAgent,
  removeRegisteredAgent,
  type KnowledgeSource,
} from "@/lib/data/agent-registry";
import { isValidSourceUrl, SUPPORTED_SOURCE_TYPES } from "@/lib/knowledge-sources";
import { requireWalletSession } from "@/lib/wallet-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Owner management for launched businesses.
 * PATCH — update name, tagline, description, price, payout address, sources.
 * DELETE — retire the business permanently.
 * Both require the signed wallet session of the owner. Slugs stay stable so
 * subscriber integrations (MCP endpoints) keep working after edits.
 */

function requireOwner(req: Request, slug: string): { ok: true } | { ok: false; res: NextResponse } {
  if (!getRegisteredAgent(slug)) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Not a launched business (catalog agents cannot be edited)" },
        { status: 404 }
      ),
    };
  }
  const owner = getAgentOwnerAddress(slug);
  const wallet = requireWalletSession(req);
  if (!owner || !wallet || wallet !== owner) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Only the owner wallet can manage this business. Connect the wallet you launched with." },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = rateLimit(req, "agent-manage", 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const { slug } = await params;
  const auth = requireOwner(req, slug);
  if (!auth.ok) return auth.res;

  let body: {
    name?: string;
    tagline?: string;
    description?: string;
    priceUsd?: number;
    payoutAddress?: string;
    sources?: KnowledgeSource[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.payoutAddress !== undefined && !/^0x[0-9a-fA-F]{40}$/.test(body.payoutAddress)) {
    return NextResponse.json({ ok: false, error: "payoutAddress must be a valid address" }, { status: 400 });
  }
  if (body.priceUsd !== undefined && (!Number.isFinite(body.priceUsd) || body.priceUsd < 0 || body.priceUsd > 10_000)) {
    return NextResponse.json({ ok: false, error: "priceUsd must be between 0 and 10000" }, { status: 400 });
  }
  if (body.sources !== undefined) {
    if (!Array.isArray(body.sources) || body.sources.length > 8) {
      return NextResponse.json({ ok: false, error: "sources must be an array of at most 8 items" }, { status: 400 });
    }
    for (const source of body.sources) {
      if (
        !source ||
        !(SUPPORTED_SOURCE_TYPES as readonly string[]).includes(source.type) ||
        typeof source.url !== "string" ||
        !isValidSourceUrl(source.url)
      ) {
        return NextResponse.json({ ok: false, error: "sources contains an unsupported type or invalid URL" }, { status: 400 });
      }
    }
  }

  const updated = updateRegisteredAgent(slug, {
    name: body.name,
    tagline: body.tagline,
    description: body.description,
    priceUsd: body.priceUsd,
    payoutAddress: body.payoutAddress,
    sources: body.sources,
  });
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, agent: getRegisteredAgent(slug) });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = rateLimit(req, "agent-manage", 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const { slug } = await params;
  const auth = requireOwner(req, slug);
  if (!auth.ok) return auth.res;

  const removed = removeRegisteredAgent(slug);
  return NextResponse.json({ ok: removed, slug });
}
