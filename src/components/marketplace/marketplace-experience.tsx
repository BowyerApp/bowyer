"use client";

import { useMemo, useState } from "react";
import { Container } from "@/components/layout/container";
import { MarketplaceHeroPanel } from "@/components/marketplace/marketplace-hero-panel";
import { MarketplaceFeaturedCard } from "@/components/marketplace/marketplace-featured-card";
import { MarketplaceLiveFeed } from "@/components/marketplace/marketplace-live-feed";
import { MarketplaceCategoryCarousel } from "@/components/marketplace/marketplace-category-carousel";
import { MarketplaceTopBusinesses } from "@/components/marketplace/marketplace-top-businesses";
import {
  MARKETPLACE_CATEGORIES,
  getTopBusinesses,
  searchAgents,
  type TopBusinessesTab,
} from "@/lib/data/marketplace-reference";
import { getAgentSummary } from "@/lib/data/agents";
import type { BusinessStats, PlatformEvent } from "@/lib/data/real-stats";
import type { AgentSummary } from "@/lib/types";

interface MarketplaceExperienceProps {
  agents: AgentSummary[];
  stats: Record<string, BusinessStats>;
  events: PlatformEvent[];
}

export function MarketplaceExperience({ agents, stats, events }: MarketplaceExperienceProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [tab, setTab] = useState<TopBusinessesTab>("trending");

  const featured = useMemo(
    () => getAgentSummary("whale-hunter") ?? agents.find((a) => a.featured) ?? agents[0],
    [agents]
  );

  const gridAgents = useMemo(() => {
    let list = getTopBusinesses(agents, tab);
    if (category) {
      const cat = MARKETPLACE_CATEGORIES.find((c) => c.id === category);
      if (cat) list = list.filter(cat.filter);
    }
    if (query) list = searchAgents(list, query);
    return list.slice(0, 6);
  }, [agents, tab, category, query]);

  function handleSearchSelect(term: string) {
    setQuery(term);
    setCategory(null);
  }

  return (
    <Container className="pt-8 lg:pt-10">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-3">
          <MarketplaceHeroPanel onSearchSelect={handleSearchSelect} />
        </div>
        <div className="lg:col-span-6">
          <MarketplaceFeaturedCard agent={featured} stats={stats[featured?.slug ?? ""]} />
        </div>
        <div className="lg:col-span-3">
          <MarketplaceLiveFeed events={events} />
        </div>
      </div>

      <MarketplaceCategoryCarousel
        activeCategory={category}
        onSelect={setCategory}
        agents={agents}
      />

      <MarketplaceTopBusinesses agents={gridAgents} stats={stats} tab={tab} onTabChange={setTab} />
    </Container>
  );
}
