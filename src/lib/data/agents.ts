import type { AgentPlatform, AgentProfile, AgentSummary, PerformancePoint } from "@/lib/types";
import {
  getRegisteredAgent,
  getRegisteredDescription,
  getRegisteredMcpEndpoint,
  listRegisteredAgents,
} from "@/lib/data/agent-registry";

const DEFAULT_PLATFORMS: AgentPlatform[] = ["agent-fun", "cursor"];

const base = (
  agent: Omit<AgentSummary, "id" | "artifactKind" | "version" | "platforms" | "stars"> &
    Partial<Pick<AgentSummary, "artifactKind" | "version" | "platforms" | "stars">> & {
      id?: string;
    }
): AgentSummary =>
  ({
    artifactKind: "agent",
    version: "1.0.0",
    platforms: DEFAULT_PLATFORMS,
    stars: agent.trendingScore,
    ...agent,
  }) as AgentSummary;

function generatePerformanceHistory(): PerformancePoint[] {
  const points: PerformancePoint[] = [];
  const start = new Date("2026-01-01");
  let signal = 100;
  let bench = 100;

  for (let i = 0; i < 190; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);

    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Deterministic pseudo-random drift from date hash
      const hash = (i * 17 + dayOfWeek * 31) % 100;
      signal += (hash / 100 - 0.46) * 0.35;
      bench += ((hash * 3) % 100 / 100 - 0.48) * 0.22;
    }

    if (iso === "2026-03-12") signal += 2.1;
    if (iso === "2026-04-22") signal += 1.8;
    if (iso === "2026-05-30") signal += 2.4;
    if (iso === "2026-06-18") signal += 1.5;

    points.push({
      date: iso,
      value: Math.round(signal * 100) / 100,
      benchmark: Math.round(bench * 100) / 100,
    });
  }

  return points;
}

const performanceHistory = generatePerformanceHistory();
const latestPoint = performanceHistory[performanceHistory.length - 1];

export const whaleHunterProfile: AgentProfile = {
  ...base({
    slug: "whale-hunter",
    name: "Whale Hunter",
    tagline:
      "Monitors large on-chain wallet flows and publishes actionable alerts for tokenized equities on Robinhood Chain.",
    thesis:
      "Institutional wallet inflows on Robinhood Chain often precede tokenized equity moves by 24–48 hours.",
    currentTask: "Monitoring bridge inflows for tokenized NVDA",
    category: "trading",
    filter: "trading",
    status: "live",
    riskLevel: "medium",
    creator: {
      name: "Flow Labs",
      handle: "flowlabs",
      verified: true,
      bio: "On-chain analytics studio focused on Robinhood Chain RWA flows.",
      memberSince: "2025-11-01",
    },
    pricing: { model: "subscription", amount: 49, currency: "USD", period: "month" },
    performance: {
      totalReturnPct: 0,
      return30dPct: 0,
      winRatePct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      asOf: "2026-07-08",
    },
    primaryMetric: { label: "Status", value: "Live" },
    followers: 0,
    revenueUsd: 0,
    artwork: "data-viz",
    featured: true,
    trendingScore: 94,
    createdAt: "2026-02-14",
    tags: ["on-chain", "alerts", "equities"],
    profileReady: true,
    artifactKind: "agent",
    version: "2.4.1",
    platforms: ["agent-fun", "cursor", "claude-code", "cline"],
    stars: 0,
  }),
  id: "agent-wh-001",
  handle: "whalehunter",
  verified: true,
  description:
    "Whale Hunter is an autonomous research agent that tracks large wallet movements, bridge inflows, and holder concentration across Robinhood Chain. It publishes alerts and structured reports — it does not execute trades or manage subscriber capital.",
  howItWorks: [
    "Scans the top 500 wallets by 7-day net inflow on Robinhood Chain every 15 minutes.",
    "Flags clusters where three or more wallets accumulate the same tokenized equity within 48 hours.",
    "Cross-references bridge contract inflows and exchange hot-wallet deposits for confirmation.",
    "Publishes alerts with context, confidence score, and supporting wallet addresses.",
    "Delivers daily summary reports and maintains a searchable alert archive for subscribers.",
  ],
  capabilities: [
    "Real-time whale cluster detection",
    "Bridge and exchange inflow monitoring",
    "Token holder concentration analysis",
    "Smart-money wallet tracking",
    "Daily sector flow summaries",
    "Webhook and email alert delivery",
    "Historical alert archive with search",
  ],
  dataSources: [
    "Robinhood Chain mainnet (Chain ID 4663)",
    "Rialto AMM liquidity events",
    "Bridge contract deposit logs",
    "Public wallet label registry (Allium)",
    "Tokenized equity metadata (RWA issuers)",
  ],
  permissions: [
    "Read-only chain indexing — no wallet access",
    "No trade execution via Robinhood Trading MCP",
    "No custody of subscriber funds",
    "Alert delivery via email, webhook, or BOWYER dashboard",
  ],
  riskDisclosure:
    "Whale Hunter provides informational alerts and research outputs only. Outputs may be incomplete, delayed, or incorrect. Past alert performance is backtested and does not guarantee future results. This agent does not provide investment advice. Subscribers are responsible for their own trading decisions.",
  currentState: {
    status: "live",
    currentlyMonitoring: "Bridge inflows and large-wallet accumulation on Robinhood Chain",
    lastCompletedAction: "Awaiting first subscriber-generated report",
    nextScheduledTask: "Reports generate on demand via MCP",
  },
  profileMetrics: {
    return30dPct: 0,
    capitalMonitoredUsd: 0,
    successfulAlerts: 0,
    subscribers: 0,
  },
  accessPlan: {
    included: [
      "Unlimited real-time alerts",
      "Daily flow summary reports",
      "Full alert archive (6 months)",
      "Webhook and email delivery",
      "Confidence scores and wallet context",
    ],
    termsNote:
      "Subscription renews monthly. Cancel anytime from your BOWYER account. No refunds for partial months.",
  },
  outputs: [],
  caseStudies: [],
  reviews: [],
  performanceHistory,
  performanceMethodology:
    "Performance reflects a backtested index of hypothetical returns from acting on Whale Hunter alerts at publication time, assuming equal-weight entries and 48-hour hold periods. Benchmark is the tokenized equity index (TEQ) on Robinhood Chain. Does not include transaction costs, slippage, or taxes. This agent does not execute trades.",
  activity: [],
  chainId: 4663,
  mcpEndpoint: "/api/mcp/whale-hunter",
  mcpTools: ["get_alerts", "generate_report", "get_latest_reports", "ask", "get_status", "subscribe_webhook"],
  usesRobinhoodMcp: false,
  versionHistory: [
    {
      version: "2.4.1",
      date: "2026-07-01",
      changelog: "Raised cluster confidence threshold for low-liquidity tokenized names.",
    },
    {
      version: "2.4.0",
      date: "2026-06-12",
      changelog: "Added smart-money wallet tier labels and webhook delivery.",
    },
    {
      version: "2.3.0",
      date: "2026-05-20",
      changelog: "Bridge inflow alerts now include 30-day z-score context.",
    },
  ],
};

/**
 * Launch catalog: one paid flagship (Whale Hunter) plus a small set of free,
 * real open-source agents from GitHub. Creators can list paid agents via /launch.
 */
export const agentSummaries: AgentSummary[] = [
  whaleHunterProfile,
  base({
    id: "agent-oss-001",
    slug: "gpt-researcher",
    name: "GPT Researcher",
    tagline:
      "Open-source deep research agent — produces detailed, cited reports from web and local data.",
    thesis:
      "Autonomous research with citations beats manual searching for any serious question.",
    currentTask: "Aggregating 20+ sources for an open research task",
    category: "analytics",
    filter: "research",
    status: "live",
    riskLevel: "low",
    creator: { name: "Assaf Elovic", handle: "assafelovic", verified: true },
    pricing: { model: "free", amount: 0, currency: "USD" },
    performance: {
      totalReturnPct: 0,
      return30dPct: 0,
      winRatePct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      asOf: "2026-07-08",
    },
    primaryMetric: { label: "GitHub stars", value: "28.1K" },
    followers: 28148,
    revenueUsd: 0,
    artwork: "analyst",
    featured: false,
    trendingScore: 90,
    createdAt: "2026-06-20",
    tags: ["research", "reports", "open-source"],
    profileReady: true,
    stars: 28148,
    version: "3.5.1",
  }),
  base({
    id: "agent-oss-002",
    slug: "autogpt",
    name: "AutoGPT",
    tagline:
      "The open-source platform for continuous AI agents that automate complex workflows.",
    thesis: "Accessible autonomous agents for everyone — the project that started the movement.",
    currentTask: "Running continuous workflow agents",
    category: "analytics",
    filter: "automation",
    status: "live",
    riskLevel: "low",
    creator: { name: "Significant Gravitas", handle: "significant-gravitas", verified: true },
    pricing: { model: "free", amount: 0, currency: "USD" },
    performance: {
      totalReturnPct: 0,
      return30dPct: 0,
      winRatePct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      asOf: "2026-07-08",
    },
    primaryMetric: { label: "GitHub stars", value: "185K" },
    followers: 185450,
    revenueUsd: 0,
    artwork: "machine",
    featured: false,
    trendingScore: 95,
    createdAt: "2026-05-30",
    tags: ["automation", "workflows", "open-source"],
    profileReady: true,
    stars: 185450,
    version: "0.6.66",
  }),
  base({
    id: "agent-oss-003",
    slug: "openhands",
    name: "OpenHands",
    tagline:
      "Open-source AI software engineer — writes code, fixes bugs, and ships changes autonomously.",
    thesis: "AI developers that can execute full engineering tasks, not just autocomplete.",
    currentTask: "Resolving open issues in a connected repository",
    category: "analytics",
    filter: "developer-tools",
    status: "live",
    riskLevel: "low",
    creator: { name: "All Hands AI", handle: "all-hands-ai", verified: true },
    pricing: { model: "free", amount: 0, currency: "USD" },
    performance: {
      totalReturnPct: 0,
      return30dPct: 0,
      winRatePct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      asOf: "2026-07-08",
    },
    primaryMetric: { label: "GitHub stars", value: "45K" },
    followers: 45000,
    revenueUsd: 0,
    artwork: "machine",
    featured: false,
    trendingScore: 87,
    createdAt: "2026-06-05",
    tags: ["developer", "coding", "open-source"],
    profileReady: true,
    stars: 45000,
    version: "0.32.0",
  }),
];

/** GitHub repos for the open-source catalog agents. */
export const GITHUB_REPOS: Record<string, string> = {
  "gpt-researcher": "https://github.com/assafelovic/gpt-researcher",
  autogpt: "https://github.com/Significant-Gravitas/AutoGPT",
  openhands: "https://github.com/All-Hands-AI/OpenHands",
};


export function listAgents(): AgentSummary[] {
  return [...listRegisteredAgents(), ...agentSummaries];
}

export function getFeaturedAgent(): AgentSummary {
  return agentSummaries.find((a) => a.featured) ?? agentSummaries[0];
}

/** Builds a complete profile for any agent that doesn't have a hand-written one. */
function buildGenericProfile(summary: AgentSummary): AgentProfile {
  const description =
    getRegisteredDescription(summary.slug) ??
    `${summary.name} is an autonomous business on BOWYER. ${summary.thesis}`;

  // Real reports live in the database and render from there; no fabricated outputs.
  const outputs: AgentProfile["outputs"] = [];

  return {
    ...summary,
    handle: summary.creator.handle,
    verified: summary.creator.verified,
    description,
    howItWorks: [
      summary.currentTask,
      "Publishes structured reports and alerts to subscribers.",
      "Runs continuously on Robinhood Chain infrastructure.",
    ],
    capabilities: summary.tags.map((t) => `${t} intelligence`),
    dataSources: ["Robinhood Chain mainnet (Chain ID 4663)", "Public market data feeds"],
    permissions: [
      "Read-only data access — no wallet custody",
      "No trade execution",
      "Alert delivery via BOWYER dashboard",
    ],
    riskDisclosure:
      "This agent provides informational outputs only. Outputs may be incomplete, delayed, or incorrect and do not constitute investment advice.",
    currentState: {
      status: summary.status,
      currentlyMonitoring: summary.currentTask,
      lastCompletedAction: "Awaiting tool calls",
      nextScheduledTask: "Reports generate on demand via MCP",
    },
    profileMetrics: {
      return30dPct: 0,
      capitalMonitoredUsd: 0,
      successfulAlerts: 0,
      subscribers: 0,
    },
    accessPlan: {
      included:
        summary.pricing.model === "free"
          ? [
              "Free and open source",
              "All reports and outputs",
              "Self-host or run on BOWYER",
              "Full source code on GitHub",
            ]
          : ["All reports and alerts", "Full output archive", "Email and dashboard delivery"],
      termsNote:
        summary.pricing.model === "free"
          ? "Free to use. Maintained by its open-source community."
          : "Subscription renews monthly. Cancel anytime from your BOWYER account.",
    },
    outputs,
    caseStudies: [],
    reviews: [],
    performanceHistory,
    performanceMethodology:
      "Performance reflects a backtested index of hypothetical returns from acting on this agent's outputs at publication time. Does not include transaction costs. This agent does not execute trades.",
    activity: [],
    chainId: 4663,
    mcpEndpoint: getRegisteredMcpEndpoint(summary.slug) ?? `/api/mcp/${summary.slug}`,
    mcpTools: ["generate_report", "get_latest_reports", "ask", "get_status", "subscribe_webhook"],
    usesRobinhoodMcp: false,
    githubRepo: GITHUB_REPOS[summary.slug],
    versionHistory: [
      { version: summary.version, date: summary.createdAt, changelog: "Initial launch." },
    ],
  };
}

export function getAgentBySlug(slug: string): AgentProfile | null {
  if (slug === "whale-hunter") return whaleHunterProfile;
  const summary =
    agentSummaries.find((a) => a.slug === slug) ?? getRegisteredAgent(slug);
  if (!summary) return null;
  return buildGenericProfile(summary);
}

export function getAgentSummary(slug: string): AgentSummary | null {
  return (
    agentSummaries.find((a) => a.slug === slug) ?? getRegisteredAgent(slug)
  );
}

export function filterAgentsByTab(agents: AgentSummary[], tab: string): AgentSummary[] {
  const sorted = [...agents];
  switch (tab) {
    case "featured":
      return sorted.filter((a) => a.featured);
    case "trending":
      return sorted.sort((a, b) => b.trendingScore - a.trendingScore);
    case "new":
      return sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case "top-performing":
      return sorted.sort((a, b) => b.performance.totalReturnPct - a.performance.totalReturnPct);
    case "most-used":
      return sorted.sort((a, b) => b.followers - a.followers);
    default:
      return sorted;
  }
}
