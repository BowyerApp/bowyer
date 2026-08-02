import type { Metadata } from "next";
import { PulseView } from "@/components/terminal/pulse";
import { getMemeScreenerCached } from "@/lib/market-data";

export const metadata: Metadata = { title: "The Hood · Terminal" };

export const dynamic = "force-dynamic";

export default function TerminalPulsePage() {
  const cached = getMemeScreenerCached();
  const initialData = cached ? { ok: true as const, ...cached } : null;
  return <PulseView initialData={initialData} />;
}
