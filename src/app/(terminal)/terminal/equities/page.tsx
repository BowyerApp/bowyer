import type { Metadata } from "next";
import { DiscoverView } from "@/components/terminal/discover";
import { getEquityScreenerCached } from "@/lib/market-data";

export const metadata: Metadata = { title: "Equities · Terminal" };

export const dynamic = "force-dynamic";

export default function TerminalEquitiesPage() {
  const cached = getEquityScreenerCached();
  const initialData = cached ? { ok: true as const, ...cached } : null;
  return <DiscoverView mode="equity" initialData={initialData} />;
}
