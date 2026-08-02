import { DiscoverView } from "@/components/terminal/discover";
import { getMemeScreenerCached } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export default function TerminalDiscoverPage() {
  const cached = getMemeScreenerCached();
  const initialData = cached ? { ok: true as const, ...cached } : null;
  return <DiscoverView mode="meme" initialData={initialData} />;
}
