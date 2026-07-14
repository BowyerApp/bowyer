import { agentSummaries, listAgents } from "@/lib/data/agents";
import { getAgentArt } from "@/lib/data/marketplace-reference";
import { getBusinessStats, getRecentEvents } from "@/lib/data/real-stats";
import { db } from "@/lib/db";
import type { AgentSummary } from "@/lib/types";
import type {
  ArenaContender,
  ArenaLeader,
  ArenaLiveData,
  ArenaLiveEvent,
  ArenaMatch,
} from "@/lib/data/arena-types";
import {
  ARENA_MATCH_JUDGED_BY,
  ARENA_MATCH_QUESTION,
} from "@/lib/data/arena-types";

const SEASON_NAME = "Season One";
const SEASON_END = new Date("2026-09-30T23:59:59Z");

const BUILTIN_SLUGS = new Set(agentSummaries.map((a) => a.slug));

const ACCENT_BY_FILTER: Record<string, string> = {
  trading: "#C8FF00",
  research: "#60A5FA",
  data: "#F97316",
  automation: "#A78BFA",
  content: "#EAB308",
  "developer-tools": "#34D399",
};

function minutesUntilUtcMidnight(): number {
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 60_000));
}

function formatConfidence(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const pct = value <= 1 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

function outputScore(stats: {
  reports: number;
  reportsToday: number;
  subscribers: number;
  avgConfidence: number | null;
}): number {
  const confidence = stats.avgConfidence ?? 0.5;
  const raw =
    stats.reports * 1.5 +
    stats.reportsToday * 8 +
    stats.subscribers * 4 +
    confidence * 25;
  return Math.min(99.9, Math.round(raw * 10) / 10);
}

function isEligible(agent: AgentSummary, stats: ReturnType<typeof getBusinessStats>): boolean {
  if (BUILTIN_SLUGS.has(agent.slug)) return true;
  return stats.reports > 0 || stats.subscribers > 0;
}

function contenderFromAgent(
  agent: AgentSummary,
  stats: ReturnType<typeof getBusinessStats>,
  prediction: number
): ArenaContender {
  const category =
    agent.category.charAt(0).toUpperCase() + agent.category.slice(1).replace(/-/g, " ");
  const states = [
    stats.reportsToday > 0
      ? `Published ${stats.reportsToday} report${stats.reportsToday === 1 ? "" : "s"} today`
      : "Monitoring live data feeds",
    agent.currentTask,
    stats.lastReportAt ? "Updating subscriber briefings" : "Preparing first report",
  ].filter(Boolean);

  return {
    name: agent.name,
    slug: agent.slug,
    icon: getAgentArt(agent),
    accent: ACCENT_BY_FILTER[agent.filter] ?? "#C8FF00",
    tagline: agent.tagline,
    category,
    creator: agent.creator.name,
    verified: agent.creator.verified,
    record: `${stats.reports} published`,
    states,
    reportsToday: stats.reportsToday,
    confidence: formatConfidence(stats.avgConfidence),
    prediction,
  };
}

function leaderFromAgent(
  agent: AgentSummary,
  stats: ReturnType<typeof getBusinessStats>,
  rank: number
): ArenaLeader {
  const createdAt = new Date(agent.createdAt);
  const isNew = Date.now() - createdAt.getTime() < 14 * 24 * 60 * 60 * 1000;

  return {
    rank,
    name: agent.name,
    slug: agent.slug,
    icon: getAgentArt(agent),
    record: `${stats.reports} published`,
    subscribers: stats.subscribers.toLocaleString(),
    reports: stats.reports,
    reportsToday: stats.reportsToday,
    confidence: formatConfidence(stats.avgConfidence),
    streak: stats.reportsToday > 0 ? `W${stats.reportsToday}` : "—",
    outputScore: outputScore(stats),
    movement: isNew ? "new" : 0,
  };
}

function buildMatch(ranked: Array<{ agent: AgentSummary; stats: ReturnType<typeof getBusinessStats> }>): ArenaMatch | null {
  if (ranked.length < 2) return null;

  const [first, second] = ranked;
  const totalToday = first.stats.reportsToday + second.stats.reportsToday;
  const aPrediction =
    totalToday > 0 ? Math.round((first.stats.reportsToday / totalToday) * 100) : 55;
  const bPrediction = 100 - aPrediction;

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
  );

  return {
    matchNumber: dayOfYear,
    question: ARENA_MATCH_QUESTION,
    judgedBy: ARENA_MATCH_JUDGED_BY,
    minutesRemaining: minutesUntilUtcMidnight(),
    a: contenderFromAgent(first.agent, first.stats, aPrediction),
    b: contenderFromAgent(second.agent, second.stats, bPrediction),
  };
}

function eventKind(action: string): ArenaLiveEvent["kind"] {
  if (/alert|anomaly|flagged/i.test(action)) return "alert";
  if (/scan|scanning|tracked/i.test(action)) return "scan";
  if (/subscriber|follow/i.test(action)) return "task";
  if (/model|training/i.test(action)) return "model";
  return "report";
}

function mapEvents(limit = 12): ArenaLiveEvent[] {
  return getRecentEvents(limit).map((event) => ({
    business: event.business.replace(/-/g, " "),
    slug: event.slug,
    event: event.action,
    kind: eventKind(event.action),
    at: event.at,
  }));
}

function activeBusinessCount(): number {
  try {
    const scheduled = (
      db().prepare("SELECT COUNT(DISTINCT slug) AS n FROM schedules WHERE enabled = 1").get() as {
        n: number;
      }
    ).n;
    const reporting = (
      db().prepare("SELECT COUNT(DISTINCT slug) AS n FROM reports").get() as { n: number }
    ).n;
    return Math.max(scheduled, reporting);
  } catch {
    return listAgents().length;
  }
}

/** Build Arena view-model from live database stats — no fabricated agents. */
export function getArenaLiveData(): ArenaLiveData {
  const agents = listAgents();
  const ranked = agents
    .map((agent) => ({ agent, stats: getBusinessStats(agent.slug) }))
    .filter(({ agent, stats }) => isEligible(agent, stats))
    .sort((a, b) => outputScore(b.stats) - outputScore(a.stats));

  const leaderboard = ranked.map(({ agent, stats }, index) =>
    leaderFromAgent(agent, stats, index + 1)
  );

  const matchCandidates = [...ranked].sort((a, b) => {
    if (b.stats.reportsToday !== a.stats.reportsToday) {
      return b.stats.reportsToday - a.stats.reportsToday;
    }
    return outputScore(b.stats) - outputScore(a.stats);
  });

  const champion = leaderboard[0];
  const daysRemaining = Math.max(
    0,
    Math.ceil((SEASON_END.getTime() - Date.now()) / 86_400_000)
  );

  return {
    season: {
      name: SEASON_NAME,
      activeBusinesses: activeBusinessCount(),
      daysRemaining,
      champion: champion?.name ?? "—",
      championStreak:
        champion && champion.reportsToday > 0
          ? `${champion.reportsToday} reports today`
          : champion
            ? "Leading season"
            : "—",
    },
    match: buildMatch(matchCandidates),
    leaderboard,
    events: mapEvents(12),
  };
}
