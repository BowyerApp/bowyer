import { NextResponse } from "next/server";
import { getStoredReports } from "@/lib/agent-runtime";
import { getAgentSummary } from "@/lib/data/agents";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const FEED_SLUGS = [
  "desk-arb-radar",
  "atlas-macro",
  "whale-hunter",
  "robinhood-trading-agent",
  "gpt-researcher",
  "hood-meme-radar",
];

/** First substantive line of a markdown report body, as a plain-text preview. */
function previewOf(body: string): string {
  for (const raw of body.split("\n")) {
    const line = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/[*_`>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .trim();
    if (line.length > 40) return line.length > 140 ? `${line.slice(0, 137)}…` : line;
  }
  return "";
}

/** Optional BOWYER research feed for the Stock Token Desk (supplier → customer). */
export async function GET(req: Request) {
  const limit = rateLimit(req, "desk-research", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const items = FEED_SLUGS.flatMap((slug) => {
    const agentName = getAgentSummary(slug)?.name ?? slug;
    return getStoredReports(slug, 3).map((r) => ({
      slug,
      agentName,
      reportId: r.id,
      title: r.title,
      preview: previewOf(r.body),
      createdAt: r.createdAt,
      href: `/agents/${slug}`,
      mcp: `/api/mcp/${slug}`,
    }));
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({
    ok: true,
    source: "bowyer",
    note: "BOWYER businesses as intelligence suppliers — subscribe or x402 for full tool access.",
    items: items.slice(0, 12),
  });
}
