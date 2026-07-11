import { NextResponse } from "next/server";
import {
  listAgentsByOwner,
  registerAgent,
  type KnowledgeSource,
} from "@/lib/data/agent-registry";
import { listAgents } from "@/lib/data/agents";
import { validateCustomLlm } from "@/lib/agent-runtime";
import { isSafePublicHttpUrl, isValidSourceUrl, SUPPORTED_SOURCE_TYPES } from "@/lib/knowledge-sources";
import { llmConfigured, sanitizeLlmConfigInput } from "@/lib/llm-config";
import { requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

/**
 * List the full business catalog (registered + built-in), or only businesses
 * launched by a wallet with ?owner=0x…
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  if (owner) {
    return NextResponse.json({ agents: listAgentsByOwner(owner) });
  }
  const agents = listAgents().map((a) => ({
    slug: a.slug,
    name: a.name,
    tagline: a.tagline,
    category: a.category,
    status: a.status,
    pricing: a.pricing,
    creator: a.creator,
    createdAt: a.createdAt,
    mcpEndpoint: `/api/mcp/${a.slug}`,
  }));
  return NextResponse.json({ agents });
}

/** Register a new agent business (MVP: in-memory store). */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const tagline = String(body.tagline ?? "").trim();
  const category = String(body.category ?? "").trim();
  const description = String(body.description ?? "").trim();
  const revenueModel = String(body.revenueModel ?? "").trim();
  const priceUsd = Number(body.priceUsd ?? 0);
  const creatorSharePct = Number(body.creatorSharePct ?? 90);
  const mcpEndpoint = body.mcpEndpoint ? String(body.mcpEndpoint).trim() : undefined;
  const payoutAddress = body.payoutAddress ? String(body.payoutAddress).trim() : undefined;
  const ownerAddress = body.ownerAddress ? String(body.ownerAddress).trim() : undefined;
  const authenticatedWallet = ownerAddress ? requireWalletSession(req, ownerAddress) : null;

  // Knowledge sources: only supported types with valid http(s) URLs, max 4.
  const requestedSources: KnowledgeSource[] = Array.isArray(body.sources)
    ? (body.sources as unknown[])
        .map((s) => {
          const src = s as { type?: unknown; url?: unknown };
          return { type: String(src.type ?? ""), url: String(src.url ?? "").trim() };
        })
        .filter(
          (s) =>
            (SUPPORTED_SOURCE_TYPES as readonly string[]).includes(s.type) &&
            isValidSourceUrl(s.url)
        )
        .slice(0, 4)
    : [];
  const sources: KnowledgeSource[] = [];
  for (const source of requestedSources) {
    const isHttp = source.type === "website" || source.type === "rss" || source.type === "github";
    if (isHttp && !(await isSafePublicHttpUrl(source.url))) continue;
    sources.push(source);
  }

  const llm = sanitizeLlmConfigInput(body) ?? { mode: "platform" as const, model: "balanced" };

  const missing: string[] = [];
  if (!name) missing.push("name");
  if (!tagline) missing.push("tagline");
  if (!category) missing.push("category");
  if (!description) missing.push("description");
  if (!revenueModel) missing.push("revenueModel");
  const isFree = revenueModel === "Free" || revenueModel === "Holder access" || priceUsd <= 0;
  if (!isFree && (!priceUsd || priceUsd <= 0)) missing.push("priceUsd");

  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }
  if (!ownerAddress || !authenticatedWallet) {
    return NextResponse.json(
      { ok: false, error: "Connect and sign your wallet session before launching a business." },
      { status: 401 }
    );
  }
  if (isFree && sources.some((source) => ["notion", "discord", "x"].includes(source.type))) {
    return NextResponse.json(
      { ok: false, error: "OAuth-backed knowledge sources require a paid business." },
      { status: 400 }
    );
  }

  // Paid agents need somewhere to send the money.
  if (!isFree && !/^0x[0-9a-fA-F]{40}$/.test(payoutAddress ?? "")) {
    return NextResponse.json(
      { ok: false, error: "Paid agents require a valid payout wallet address (0x…)" },
      { status: 400 }
    );
  }

  // Custom LLM: validate key works before storing.
  if (llm?.mode === "custom") {
    const ok = await validateCustomLlm(llm);
    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not verify your API key. Check the key, model name, and endpoint, then try again.",
        },
        { status: 400 }
      );
    }
  } else if (llm.mode === "platform" && !llmConfigured(llm)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Platform LLM is not configured on this server. Use “Your API key” instead.",
      },
      { status: 503 }
    );
  }

  const { slug } = registerAgent({
    name,
    tagline,
    category,
    description,
    revenueModel,
    priceUsd: isFree ? 0 : priceUsd,
    creatorSharePct,
    mcpEndpoint,
    payoutAddress,
    ownerAddress,
    sources,
    llm,
  });

  return NextResponse.json({
    ok: true,
    slug,
    url: `/agents/${slug}`,
    mcpEndpoint: `/api/mcp/${slug}`,
    chainId: 4663,
  });
}
