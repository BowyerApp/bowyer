export type AgentCategory =
  | "trading"
  | "defi"
  | "analytics"
  | "arbitrage"
  | "social";

export type MarketplaceFilter =
  | "trading"
  | "research"
  | "data"
  | "automation"
  | "content"
  | "developer-tools";

export type MarketplaceTab =
  | "featured"
  | "trending"
  | "new"
  | "top-performing"
  | "most-used";

export type ArtworkStyle =
  | "abstract"
  | "analyst"
  | "symbolic"
  | "machine"
  | "typography"
  | "data-viz";

export type AgentStatus = "live" | "beta" | "paused" | "idle";

export type PricingModel = "free" | "subscription" | "one-time" | "invest";

export type RiskLevel = "low" | "medium" | "high";

export type ActivityType = "alert" | "report" | "scan" | "publish";

export type ProfileTab = "overview" | "performance" | "activity" | "capabilities" | "reviews";

export type ArtifactKind = "agent" | "skill" | "workflow";

export type CatalogView = "grid" | "list";

export type AgentPlatform =
  | "cursor"
  | "claude-code"
  | "windsurf"
  | "cline"
  | "copilot"
  | "agent-fun";

export interface AgentCreator {
  name: string;
  handle: string;
  verified: boolean;
  bio?: string;
  memberSince?: string;
}

export interface AgentPricing {
  model: PricingModel;
  amount: number;
  currency: "USD" | "USDC";
  period?: "month" | "year";
  minInvestment?: number;
}

export interface AgentPerformance {
  totalReturnPct: number;
  return30dPct: number;
  winRatePct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  asOf: string;
}

export interface AgentPrimaryMetric {
  label: string;
  value: string;
}

export interface AgentVersion {
  version: string;
  date: string;
  changelog: string;
}

export interface AgentSummary {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  thesis: string;
  currentTask: string;
  category: AgentCategory;
  filter: MarketplaceFilter;
  status: AgentStatus;
  riskLevel: RiskLevel;
  creator: AgentCreator;
  pricing: AgentPricing;
  performance: AgentPerformance;
  primaryMetric: AgentPrimaryMetric;
  followers: number;
  revenueUsd: number;
  artwork: ArtworkStyle;
  featured: boolean;
  trendingScore: number;
  createdAt: string;
  tags: string[];
  profileReady: boolean;
  /** AgentVerse-style artifact metadata */
  artifactKind: ArtifactKind;
  version: string;
  platforms: AgentPlatform[];
  stars: number;
  /** Auto-forged or uploaded 3D avatar URL (DB-backed; overrides the static map). */
  avatarGlb?: string | null;
  /** Incubator lineage: slug of the agent that autonomously founded this business. */
  foundedBy?: string | null;
  /** GitHub repository this business wraps ("owner/name"). */
  sourceRepo?: string | null;
}

export interface AgentOutput {
  id: string;
  title: string;
  timestamp: string;
  summary: string;
  reportId: string;
}

export interface AgentCaseStudy {
  id: string;
  title: string;
  date: string;
  summary: string;
  outcome: string;
}

export interface AgentReview {
  id: string;
  author: string;
  handle: string;
  rating: number;
  date: string;
  body: string;
}

export interface AgentCurrentState {
  status: AgentStatus;
  currentlyMonitoring: string;
  lastCompletedAction: string;
  nextScheduledTask: string;
}

export interface AgentAccessPlan {
  included: string[];
  termsNote: string;
}

export interface AgentProfileMetrics {
  return30dPct: number;
  capitalMonitoredUsd: number;
  successfulAlerts: number;
  subscribers: number;
}

export interface PerformancePoint {
  date: string;
  value: number;
  benchmark: number;
}

export interface AgentActivity {
  id: string;
  timestamp: string;
  type: ActivityType;
  summary: string;
}

export interface AgentProfile extends AgentSummary {
  handle: string;
  verified: boolean;
  description: string;
  howItWorks: string[];
  capabilities: string[];
  dataSources: string[];
  permissions: string[];
  riskDisclosure: string;
  currentState: AgentCurrentState;
  profileMetrics: AgentProfileMetrics;
  accessPlan: AgentAccessPlan;
  outputs: AgentOutput[];
  caseStudies: AgentCaseStudy[];
  reviews: AgentReview[];
  performanceHistory: PerformancePoint[];
  performanceMethodology: string;
  activity: AgentActivity[];
  chainId: 4663;
  /** Smithery-style MCP integration */
  mcpEndpoint?: string;
  mcpTools?: string[];
  usesRobinhoodMcp?: boolean;
  versionHistory: AgentVersion[];
  githubRepo?: string;
}

export const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
  agent: "Agent",
  skill: "Skill",
  workflow: "Workflow",
};

export const FILTER_LABELS: Record<MarketplaceFilter, string> = {
  trading: "Trading",
  research: "Research",
  data: "Data",
  automation: "Automation",
  content: "Content",
  "developer-tools": "Developer tools",
};

export const TAB_LABELS: Record<MarketplaceTab, string> = {
  featured: "Featured",
  trending: "Trending",
  new: "New",
  "top-performing": "Top performing",
  "most-used": "Most used",
};

export const PROFILE_TAB_LABELS: Record<ProfileTab, string> = {
  overview: "Overview",
  performance: "Performance",
  activity: "Activity",
  capabilities: "Capabilities",
  reviews: "Reviews",
};

export const PRICING_LABELS: Record<PricingModel, string> = {
  free: "Use for free",
  subscription: "Subscribe",
  "one-time": "Buy access",
  invest: "Invest",
};

export function formatAccessModel(pricing: AgentPricing): string {
  if (pricing.model === "free") return "Free";
  if (pricing.model === "invest") {
    return `Invest · ${pricing.minInvestment ?? 0}+ ${pricing.currency}`;
  }
  if (pricing.model === "subscription") {
    return `$${pricing.amount}/${pricing.period === "year" ? "yr" : "mo"}`;
  }
  return `$${pricing.amount}`;
}
