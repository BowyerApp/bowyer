import { MarketplaceExperience } from "@/components/marketplace/marketplace-experience";
import { listAgents } from "@/lib/data/agents";
import {
  getBusinessStats,
  getRecentEvents,
  type BusinessStats,
} from "@/lib/data/real-stats";

export const metadata = { title: "Explore" };

/** Render on demand so newly listed agents appear immediately. */
export const dynamic = "force-dynamic";

export default function MarketplacePage() {
  const agents = listAgents();
  const stats: Record<string, BusinessStats> = {};
  for (const a of agents) stats[a.slug] = getBusinessStats(a.slug);
  const events = getRecentEvents(8);

  return <MarketplaceExperience agents={agents} stats={stats} events={events} />;
}
