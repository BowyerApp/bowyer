import type { AgentSummary } from "@/lib/types";
import { filterAgentsByTab } from "@/lib/data/agents";

export const POPULAR_SEARCHES = [
  "Whale tracking",
  "Macro research",
  "Options trading",
  "News alerts",
] as const;

export interface MarketplaceCategory {
  id: string;
  label: string;
  image: string;
  filter: (agent: AgentSummary) => boolean;
}

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  {
    id: "trading",
    label: "Trading",
    image: "/images/robots/robot-trading.png",
    filter: (a) => a.filter === "trading",
  },
  {
    id: "macro",
    label: "Macro",
    image: "/images/robots/robot-macro.png",
    filter: (a) => a.tags.some((t) => ["sectors", "macro", "rwa"].includes(t)),
  },
  {
    id: "research",
    label: "Research",
    image: "/images/robots/robot-research.png",
    filter: (a) => a.filter === "research",
  },
  {
    id: "security",
    label: "Security",
    image: "/images/robots/robot-security.png",
    filter: (a) =>
      a.filter === "data" ||
      a.tags.some((t) => ["analytics", "alerts", "on-chain"].includes(t)),
  },
  {
    id: "content",
    label: "Content",
    image: "/images/robots/robot-news.png",
    filter: (a) => a.filter === "content",
  },
  {
    id: "developer",
    label: "Developer",
    image: "/images/robots/robot-developer.png",
    filter: (a) => a.filter === "developer-tools",
  },
  {
    id: "data",
    label: "Data",
    image: "/images/robots/robot-research.png",
    filter: (a) => a.filter === "data",
  },
  {
    id: "automation",
    label: "Automation",
    image: "/images/robots/robot-automation.png",
    filter: (a) => a.filter === "automation",
  },
];

export type TopBusinessesTab = "trending" | "new" | "top-revenue" | "most-used";

export const TOP_BUSINESSES_TABS: { id: TopBusinessesTab; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "top-revenue", label: "Top revenue" },
  { id: "most-used", label: "Most used" },
];

/** Curated grid order for the trending view */
const TRENDING_SLUGS = [
  "robinhood-trading-agent",
  "atlas-macro",
  "nyx-forensics",
  "vega-narrative",
  "whale-hunter",
  "hood-meme-radar",
  "autogpt",
  "gpt-researcher",
  "openhands",
] as const;

export const CARD_ART: Record<string, string> = {
  "robinhood-trading-agent": "/images/agents/robinhood-trading-agent.png",
  "whale-hunter": "/images/robots/robot-trading.png",
  "hood-meme-radar": "/images/agents/hood-meme-radar.png",
  "desk-arb-radar": "/images/robots/robot-trading.png",
  "atlas-macro": "/images/robots/robot-macro.png",
  "nyx-forensics": "/images/robots/robot-security.png",
  "vega-narrative": "/images/robots/robot-news.png",
  "gpt-researcher": "/images/robots/robot-research.png",
  autogpt: "/images/robots/robot-automation.png",
  openhands: "/images/robots/robot-developer.png",
};

/** Default branded robot artwork by category, until creators upload their own. */
const ART_BY_FILTER: Record<string, string> = {
  trading: "/images/robots/robot-trading.png",
  research: "/images/robots/robot-research.png",
  data: "/images/robots/robot-security.png",
  automation: "/images/robots/robot-automation.png",
  content: "/images/robots/robot-news.png",
  "developer-tools": "/images/robots/robot-developer.png",
};

export function getAgentArt(agent: AgentSummary): string {
  return (
    CARD_ART[agent.slug] ?? ART_BY_FILTER[agent.filter] ?? "/images/robots/robot-trading.png"
  );
}

export const CATEGORY_LABELS: Record<string, string> = {
  "robinhood-trading-agent": "Agentic Trading",
  "whale-hunter": "Trading",
  "hood-meme-radar": "Memecoins · Free",
  "desk-arb-radar": "Stock Tokens · Free",
  "atlas-macro": "Macro · Premium",
  "nyx-forensics": "Forensics · Premium",
  "vega-narrative": "Narratives · Premium",
  "gpt-researcher": "Research · Free",
  autogpt: "Automation · Free",
  openhands: "Developer · Free",
};

export function getTopBusinesses(
  agents: AgentSummary[],
  tab: TopBusinessesTab
): AgentSummary[] {
  if (tab === "trending") {
    return TRENDING_SLUGS.map((slug) => agents.find((a) => a.slug === slug)).filter(
      Boolean
    ) as AgentSummary[];
  }

  const sorted = [...agents];
  switch (tab) {
    case "new":
      return sorted
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6);
    case "top-revenue":
      return sorted.sort((a, b) => b.revenueUsd - a.revenueUsd).slice(0, 6);
    case "most-used":
      return filterAgentsByTab(sorted, "most-used").slice(0, 6);
    default:
      return sorted.slice(0, 6);
  }
}

export function formatCompactCount(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(value);
}

export function searchAgents(agents: AgentSummary[], query: string): AgentSummary[] {
  const q = query.toLowerCase().trim();
  if (!q) return agents;
  return agents.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.tagline.toLowerCase().includes(q) ||
      a.thesis.toLowerCase().includes(q) ||
      a.tags.some((t) => t.includes(q)) ||
      a.creator.name.toLowerCase().includes(q)
  );
}
