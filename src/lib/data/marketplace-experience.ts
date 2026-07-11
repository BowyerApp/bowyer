import type { AgentSummary, MarketplaceFilter } from "@/lib/types";

/** Capability worlds — editorial categories, not filter pills */
export type CapabilityId =
  | "trading"
  | "research"
  | "news"
  | "macro"
  | "automation"
  | "developer"
  | "security"
  | "content"
  | "analytics";

export interface CapabilityWorld {
  id: CapabilityId;
  label: string;
  tagline: string;
  /** Maps to primary filter or tag heuristic */
  match: (agent: AgentSummary) => boolean;
}

export const EXAMPLE_SEARCHES = [
  "Track whale wallets",
  "Trade options",
  "Research earnings",
  "Monitor macro news",
  "Watch stablecoins",
  "Find arbitrage",
  "Write reports",
] as const;

export const CAPABILITY_WORLDS: CapabilityWorld[] = [
  {
    id: "trading",
    label: "Trading",
    tagline: "Agents that watch markets and act on signals",
    match: (a) => a.filter === "trading",
  },
  {
    id: "research",
    label: "Research",
    tagline: "Deep reports, filings, and equity analysis",
    match: (a) => a.filter === "research",
  },
  {
    id: "news",
    label: "News",
    tagline: "Real-time narrative and event monitoring",
    match: (a) => a.tags.some((t) => ["news", "signals", "social"].includes(t)),
  },
  {
    id: "macro",
    label: "Macro",
    tagline: "Rates, sectors, and cross-asset context",
    match: (a) => a.tags.some((t) => ["sectors", "macro", "rwa"].includes(t)),
  },
  {
    id: "automation",
    label: "Automation",
    tagline: "Treasury, yield, and operational agents",
    match: (a) => a.filter === "automation",
  },
  {
    id: "developer",
    label: "Developer",
    tagline: "APIs, MCP tooling, and infrastructure",
    match: (a) => a.filter === "developer-tools",
  },
  {
    id: "security",
    label: "Security",
    tagline: "Monitoring, anomalies, and wallet intelligence",
    match: (a) =>
      a.filter === "data" ||
      a.tags.some((t) => ["analytics", "alerts", "on-chain"].includes(t)),
  },
  {
    id: "content",
    label: "Content",
    tagline: "Narratives subscribers actually read",
    match: (a) => a.filter === "content",
  },
  {
    id: "analytics",
    label: "Analytics",
    tagline: "Data products and quantitative surfaces",
    match: (a) => a.filter === "data",
  },
];

/** Fix analytics vs security overlap — security gets on-chain/analytics tags first */
export function agentCapabilityId(agent: AgentSummary): CapabilityId {
  if (agent.filter === "trading") return "trading";
  if (agent.filter === "research") return "research";
  if (agent.filter === "automation") return "automation";
  if (agent.filter === "developer-tools") return "developer";
  if (agent.filter === "content") return "content";
  if (agent.tags.some((t) => ["news", "signals", "social"].includes(t))) return "news";
  if (agent.tags.some((t) => ["sectors", "macro", "rwa"].includes(t))) return "macro";
  if (agent.filter === "data") return "analytics";
  return "research";
}

export function filterAgentsByCapability(
  agents: AgentSummary[],
  capability: CapabilityId | null
): AgentSummary[] {
  if (!capability) return agents;
  const world = CAPABILITY_WORLDS.find((w) => w.id === capability);
  if (!world) return agents;
  return agents.filter(world.match);
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

/** Editorial features — diverse visual identities, not just top by score */
export function getFeaturedBusinesses(agents: AgentSummary[]): AgentSummary[] {
  const picks = [
    "whale-hunter",
    "ledger-notes",
    "sector-brief",
    "yield-router",
    "rialto-spread",
  ];
  return picks
    .map((slug) => agents.find((a) => a.slug === slug))
    .filter(Boolean) as AgentSummary[];
}

export function getRecentlyLaunched(agents: AgentSummary[]): AgentSummary[] {
  return [...agents]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);
}

export const CAPABILITY_VISUAL: Record<
  CapabilityId,
  { bg: string; accent: string; mood: string }
> = {
  trading: { bg: "#121110", accent: "#C8FF00", mood: "markets" },
  research: { bg: "#0E1014", accent: "#8BA4C7", mood: "papers" },
  news: { bg: "#101010", accent: "#E8E4DC", mood: "headlines" },
  macro: { bg: "#11100E", accent: "#C4A574", mood: "globe" },
  automation: { bg: "#0E100E", accent: "#7CB87C", mood: "grid" },
  developer: { bg: "#080C08", accent: "#6BFF9E", mood: "terminal" },
  security: { bg: "#100C0C", accent: "#C77B7B", mood: "shield" },
  content: { bg: "#121110", accent: "#D4C4B0", mood: "editorial" },
  analytics: { bg: "#0A0E12", accent: "#6BA3C7", mood: "data" },
};

export function filterToCapabilityId(filter: MarketplaceFilter): CapabilityId {
  const map: Record<MarketplaceFilter, CapabilityId> = {
    trading: "trading",
    research: "research",
    data: "analytics",
    automation: "automation",
    content: "content",
    "developer-tools": "developer",
  };
  return map[filter];
}
