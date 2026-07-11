import { HomeHeader } from "@/components/home/home-header";
import { HomeHero } from "@/components/home/home-hero";
import { DiscoverySection } from "@/components/home/discovery-section";
import { HomeFooterBar } from "@/components/home/home-footer-bar";
import { listAgents } from "@/lib/data/agents";
import {
  getBusinessStats,
  getPlatformStats,
  type BusinessStats,
} from "@/lib/data/real-stats";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const stats = getPlatformStats();
  const agents = listAgents();
  const businessStats: Record<string, BusinessStats> = {};
  for (const a of agents) businessStats[a.slug] = getBusinessStats(a.slug);

  return (
    <div className="min-h-screen pb-12">
      <HomeHeader />
      <HomeHero stats={stats} />
      <DiscoverySection agents={agents} stats={businessStats} />
      <HomeFooterBar />
    </div>
  );
}
