/**
 * Creator revenue + trust signals for the portfolio earnings dashboard.
 */

import { db } from "@/lib/db";
import { listAgentsByOwner, listEarnings } from "@/lib/data/agent-registry";
import { listX402Earnings } from "@/lib/x402";
import { getRegistryEntry, syncAgentToRegistry } from "@/lib/business-registry";
import { countStoredReports } from "@/lib/agent-runtime";

const isServer = typeof window === "undefined";

export interface CreatorTrustBusiness {
  slug: string;
  name: string;
  subscribers: number;
  payingSubscribers: number;
  subscriptionRevenueUsd: number;
  x402RevenueUsdg: number;
  reports: number;
  paidOnChain: boolean;
  registryListed: boolean;
  registryPage: string | null;
  mcpUrl: string | null;
}

export interface CreatorDashboard {
  owner: string;
  totalSubscriptionUsd: number;
  totalX402Usdg: number;
  totalSubscribers: number;
  businesses: CreatorTrustBusiness[];
  recentPayments: {
    kind: "subscription" | "x402";
    slug: string;
    from: string;
    amount: number;
    currency: "USD" | "USDG";
    txHash?: string;
    at: string;
    tool?: string;
  }[];
  exportCsv: string;
}

export function getCreatorDashboard(owner: string): CreatorDashboard {
  if (!isServer) {
    return {
      owner,
      totalSubscriptionUsd: 0,
      totalX402Usdg: 0,
      totalSubscribers: 0,
      businesses: [],
      recentPayments: [],
      exportCsv: "",
    };
  }

  const businesses = listAgentsByOwner(owner);
  const earnings = listEarnings(owner);
  const x402 = listX402Earnings(owner);

  const bySlug = new Map<string, CreatorTrustBusiness>();

  for (const b of businesses) {
    syncAgentToRegistry(b.slug);
    const reg = getRegistryEntry(b.slug);
    const subRows = earnings.filter((e) => e.slug === b.slug);
    const xRows = x402.filter((e) => e.slug === b.slug);
    bySlug.set(b.slug, {
      slug: b.slug,
      name: b.name,
      subscribers: subRows.length,
      payingSubscribers: subRows.filter((e) => e.amountUsd > 0).length,
      subscriptionRevenueUsd: subRows.reduce((s, e) => s + e.amountUsd, 0),
      x402RevenueUsdg: xRows.reduce((s, e) => s + e.amountUsdg, 0),
      reports: countStoredReports(b.slug),
      paidOnChain: subRows.some((e) => Boolean(e.txHash) && e.amountUsd > 0) || xRows.length > 0,
      registryListed: reg?.listed ?? true,
      registryPage: reg?.pageUrl ?? null,
      mcpUrl: reg?.mcpUrl ?? null,
    });
  }

  // Include platform agents if this wallet is PLATFORM_PAYOUT and has earnings
  for (const e of earnings) {
    if (!bySlug.has(e.slug)) {
      const nameRow = db()
        .prepare("SELECT summary FROM agents WHERE slug = ?")
        .get(e.slug) as { summary: string } | undefined;
      let name = e.slug;
      try {
        if (nameRow) name = (JSON.parse(nameRow.summary) as { name?: string }).name ?? e.slug;
      } catch {
        /* ignore */
      }
      const subRows = earnings.filter((x) => x.slug === e.slug);
      const xRows = x402.filter((x) => x.slug === e.slug);
      const reg = getRegistryEntry(e.slug) ?? syncAgentToRegistry(e.slug);
      bySlug.set(e.slug, {
        slug: e.slug,
        name,
        subscribers: subRows.length,
        payingSubscribers: subRows.filter((x) => x.amountUsd > 0).length,
        subscriptionRevenueUsd: subRows.reduce((s, x) => s + x.amountUsd, 0),
        x402RevenueUsdg: xRows.reduce((s, x) => s + x.amountUsdg, 0),
        reports: countStoredReports(e.slug),
        paidOnChain: subRows.some((x) => Boolean(x.txHash) && x.amountUsd > 0) || xRows.length > 0,
        registryListed: reg?.listed ?? true,
        registryPage: reg?.pageUrl ?? null,
        mcpUrl: reg?.mcpUrl ?? null,
      });
    }
  }

  const recentPayments = [
    ...earnings.map((e) => ({
      kind: "subscription" as const,
      slug: e.slug,
      from: e.subscriber,
      amount: e.amountUsd,
      currency: "USD" as const,
      txHash: e.txHash,
      at: e.at,
    })),
    ...x402.map((e) => ({
      kind: "x402" as const,
      slug: e.slug,
      from: e.payer,
      amount: e.amountUsdg,
      currency: "USDG" as const,
      txHash: e.txHash,
      at: e.at,
      tool: e.tool,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const bizList = [...bySlug.values()];
  const totalSubscriptionUsd = bizList.reduce((s, b) => s + b.subscriptionRevenueUsd, 0);
  const totalX402Usdg = bizList.reduce((s, b) => s + b.x402RevenueUsdg, 0);
  const totalSubscribers = bizList.reduce((s, b) => s + b.subscribers, 0);

  const csvLines = [
    "kind,slug,from,amount,currency,tx_hash,at,tool",
    ...recentPayments.map((p) =>
      [
        p.kind,
        p.slug,
        p.from,
        p.amount,
        p.currency,
        p.txHash ?? "",
        p.at,
        "tool" in p ? (p.tool ?? "") : "",
      ].join(",")
    ),
  ];

  return {
    owner: owner.toLowerCase(),
    totalSubscriptionUsd,
    totalX402Usdg,
    totalSubscribers,
    businesses: bizList,
    recentPayments: recentPayments.slice(0, 100),
    exportCsv: csvLines.join("\n"),
  };
}
