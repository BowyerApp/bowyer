import { NextResponse } from "next/server";
import { listAgents, getAgentSummary } from "@/lib/data/agents";
import { getAgentArt } from "@/lib/data/marketplace-reference";
import { getAgentAvatarGlb } from "@/lib/agent-avatars";
import {
  dailyHireCap,
  economyEdges,
  economyStats,
  hiresTodayBy,
  hiringEnabled,
  listHires,
  setDailyHireCap,
} from "@/lib/agent-treasury";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Live Economy — read model for the /economy page.
 * Nodes are businesses, edges are aggregated buyer→seller staffing flows,
 * the feed is the raw hire ledger. Internal hires are free; external agents
 * pay the same tools at list price via x402.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 168, 1), 24 * 30);

  const edges = economyEdges(hours);
  const feed = listHires(40);
  const stats = economyStats();

  // Every business on an edge or in the feed must resolve to a node; listed
  // flagships appear even before their first hire so the graph never looks dead.
  const slugs = new Set<string>();
  for (const e of edges) {
    slugs.add(e.buyer);
    slugs.add(e.seller);
  }
  for (const h of feed) {
    slugs.add(h.buyer);
    slugs.add(h.seller);
  }
  for (const agent of listAgents().slice(0, 24)) slugs.add(agent.slug);

  const nodes = [...slugs]
    .map((slug) => {
      const agent = getAgentSummary(slug);
      if (!agent) return null;
      const hiredCount = edges.filter((e) => e.seller === slug).reduce((s, e) => s + e.hires, 0);
      const staffedCount = edges.filter((e) => e.buyer === slug).reduce((s, e) => s + e.hires, 0);
      return {
        slug,
        name: agent.name,
        art: getAgentArt(agent),
        avatarGlb: getAgentAvatarGlb(agent),
        hiredCount,
        staffedCount,
      };
    })
    .filter(Boolean);

  const name = (slug: string) => getAgentSummary(slug)?.name ?? slug;
  return NextResponse.json({
    ok: true,
    hours,
    nodes,
    edges,
    feed: feed.map((h) => ({
      ...h,
      buyerName: name(h.buyer),
      sellerName: name(h.seller),
    })),
    stats: {
      ...stats,
      topEmployeeName: stats.topEmployee ? name(stats.topEmployee.slug) : null,
      topSpenderName: stats.topSpender ? name(stats.topSpender.slug) : null,
    },
    hiring: { enabled: hiringEnabled() },
  });
}

/**
 * Admin staffing control (kill switch): set one business's daily hire
 * allowance, or zero every allowance at once with { all: true, dailyHires: 0 }.
 */
export async function PATCH(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    all?: boolean;
    dailyHires?: number;
  };
  const cap = Number(body.dailyHires);
  if (!Number.isFinite(cap) || cap < 0) {
    return NextResponse.json({ error: "dailyHires must be a number ≥ 0" }, { status: 400 });
  }

  if (body.all) {
    const updated: string[] = [];
    for (const agent of listAgents()) {
      setDailyHireCap(agent.slug, cap);
      updated.push(agent.slug);
    }
    return NextResponse.json({ ok: true, updated: updated.length, dailyHires: cap });
  }

  const slug = body.slug?.trim();
  if (!slug || !getAgentSummary(slug)) {
    return NextResponse.json({ error: "Unknown slug" }, { status: 400 });
  }
  setDailyHireCap(slug, cap);
  return NextResponse.json({
    ok: true,
    slug,
    dailyHires: dailyHireCap(slug),
    hiresToday: hiresTodayBy(slug),
  });
}
