/**
 * ACP provider inventory — BOWYER businesses advertised as hireable offerings
 * for Virtuals / agent-commerce clients on Robinhood Chain (4663).
 *
 * This is the live catalog counterpart to examples/virtuals-acp/.
 */

import { db } from "@/lib/db";
import { getAgentSummary } from "@/lib/data/agents";
import { x402PriceUsdg } from "@/lib/x402";
import { ACTIVE_CHAIN } from "@/lib/chain";
import { syncAgentToRegistry } from "@/lib/business-registry";

const isServer = typeof window === "undefined";

export interface AcpOffering {
  id: string;
  slug: string;
  title: string;
  description: string;
  serviceTool: string;
  priceUsdg: number;
  chainId: number;
  active: boolean;
  mcpUrl: string;
  hirePath: string;
  createdAt: string;
  updatedAt: string;
}

interface AcpRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  service_tool: string;
  price_usdg: number;
  chain_id: number;
  active: number;
  acp_job_schema: string | null;
  created_at: string;
  updated_at: string;
}

function publicBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.BOWYER_PUBLIC_URL?.replace(/\/$/, "") ||
    "https://bowyer.app"
  );
}

function rowToOffering(row: AcpRow): AcpOffering {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    serviceTool: row.service_tool,
    priceUsdg: row.price_usdg,
    chainId: row.chain_id,
    active: row.active === 1,
    mcpUrl: `${publicBase()}/api/mcp/${row.slug}`,
    hirePath: `${publicBase()}/api/acp/hire`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Seed / refresh the default ACP provider set (top catalog businesses). */
export function ensureDefaultAcpOfferings(): AcpOffering[] {
  if (!isServer) return [];
  const defaults: { slug: string; tool: string; title: string; description: string }[] = [
    {
      slug: "hood-meme-radar",
      tool: "get_radar",
      title: "Hood Meme Radar scan",
      description:
        "Scan recent Robinhood Chain blocks for launch candidates, funding clusters, and token risk signals.",
    },
    {
      slug: "hood-meme-radar",
      tool: "scan_token",
      title: "Token risk scan",
      description: "Deep-scan a token address for proxy patterns, holders, and market data.",
    },
    {
      slug: "desk-arb-radar",
      tool: "generate_report",
      title: "Stock Token dislocation report",
      description:
        "Premium/discount report for Robinhood Chain Stock Tokens versus equity spot, with live signal and history data.",
    },
    {
      slug: "whale-hunter",
      tool: "get_alerts",
      title: "Whale flow alerts",
      description: "Notable on-chain wallet flows and alerts for tokenized equities on Robinhood Chain.",
    },
    {
      slug: "gpt-researcher",
      tool: "generate_report",
      title: "Research report",
      description: "Generate a grounded research report from live web + knowledge sources.",
    },
    {
      slug: "robinhood-trading-agent",
      tool: "ask",
      title: "Trading desk Q&A",
      description: "Ask the Robinhood Trading Agent for policy-aware research and trade framing.",
    },
  ];

  // Unique by slug — keep the primary tool per business for the catalog.
  const bySlug = new Map<string, (typeof defaults)[number]>();
  for (const d of defaults) {
    if (!bySlug.has(d.slug)) bySlug.set(d.slug, d);
  }

  for (const d of bySlug.values()) {
    const agent = getAgentSummary(d.slug);
    if (!agent) continue;
    syncAgentToRegistry(d.slug);
    const id = `acp_${d.slug}`;
    const price = x402PriceUsdg(d.slug, d.tool);
    const now = new Date().toISOString();
    db()
      .prepare(
        `INSERT INTO acp_offerings
           (id, slug, title, description, service_tool, price_usdg, chain_id, active, acp_job_schema, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           service_tool = excluded.service_tool,
           price_usdg = excluded.price_usdg,
           active = 1,
           updated_at = excluded.updated_at`
      )
      .run(
        id,
        d.slug,
        d.title,
        d.description,
        d.tool,
        price,
        ACTIVE_CHAIN.chainIdDecimal,
        JSON.stringify({
          phases: ["request", "negotiation", "transaction", "evaluation"],
          deliverable: "text/markdown via MCP tools/call",
          settlement: "USDG x402 or BOWYER subscription",
        }),
        now,
        now
      );
  }

  return listAcpOfferings();
}

export function listAcpOfferings(activeOnly = true): AcpOffering[] {
  if (!isServer) return [];
  const rows = (
    activeOnly
      ? db().prepare("SELECT * FROM acp_offerings WHERE active = 1 ORDER BY updated_at DESC").all()
      : db().prepare("SELECT * FROM acp_offerings ORDER BY updated_at DESC").all()
  ) as AcpRow[];
  return rows.map(rowToOffering);
}

export function getAcpOffering(slug: string): AcpOffering | null {
  if (!isServer) return null;
  const row = db()
    .prepare("SELECT * FROM acp_offerings WHERE slug = ?")
    .get(slug) as AcpRow | undefined;
  return row ? rowToOffering(row) : null;
}
