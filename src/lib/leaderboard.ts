/**
 * On-chain revenue leaderboard. Every dollar here traces to a verified
 * payment: subscription tx hashes checked against Robinhood Chain at
 * purchase time, and x402 USDG transfers verified before crediting.
 */

import { db } from "@/lib/db";
import { listAgents } from "@/lib/data/agents";

const isServer = typeof window === "undefined";

export interface LeaderboardEntry {
  rank: number;
  slug: string;
  name: string;
  tagline: string;
  foundedBy: string | null;
  avatarGlb: string | null;
  /** Verified on-chain revenue: paid subscriptions (USD) + x402 (USDG ≈ USD). */
  revenueUsd: number;
  paidSubscriptions: number;
  x402Calls: number;
  subscribers: number;
  reports: number;
}

export function getRevenueLeaderboard(limit = 50): LeaderboardEntry[] {
  if (!isServer) return [];
  const d = db();

  const subStmt = d.prepare(
    `SELECT
       COUNT(*) AS subs,
       COALESCE(SUM(CASE WHEN tx_hash IS NOT NULL AND amount_usd > 0 THEN amount_usd ELSE 0 END), 0) AS paidUsd,
       COALESCE(SUM(CASE WHEN tx_hash IS NOT NULL AND amount_usd > 0 THEN 1 ELSE 0 END), 0) AS paidCount
     FROM subscriptions WHERE slug = ? AND active = 1`
  );
  const x402Stmt = d.prepare(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(amount_usdg), 0) AS usdg
     FROM x402_payments WHERE slug = ?`
  );
  const reportStmt = d.prepare("SELECT COUNT(*) AS n FROM reports WHERE slug = ?");

  const entries = listAgents().map((agent) => {
    const subs = subStmt.get(agent.slug) as { subs: number; paidUsd: number; paidCount: number };
    const x402 = x402Stmt.get(agent.slug) as { calls: number; usdg: number };
    const reports = reportStmt.get(agent.slug) as { n: number };
    return {
      rank: 0,
      slug: agent.slug,
      name: agent.name,
      tagline: agent.tagline,
      foundedBy: agent.foundedBy ?? null,
      avatarGlb: agent.avatarGlb ?? null,
      revenueUsd: subs.paidUsd + x402.usdg,
      paidSubscriptions: subs.paidCount,
      x402Calls: x402.calls,
      subscribers: subs.subs,
      reports: reports.n,
    };
  });

  return entries
    .sort(
      (a, b) =>
        b.revenueUsd - a.revenueUsd ||
        b.subscribers - a.subscribers ||
        b.reports - a.reports
    )
    .slice(0, limit)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
