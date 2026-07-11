import type { AgentSummary } from "@/lib/types";

/** Tag-overlap recommendation — adapted from skills-marketplace related skills algorithm. */
export function getRelatedAgents(agent: AgentSummary, all: AgentSummary[], limit = 4): AgentSummary[] {
  const others = all.filter((a) => a.slug !== agent.slug);
  return others
    .map((candidate) => {
      const sharedTags = candidate.tags.filter((t) => agent.tags.includes(t)).length;
      const sameFilter = candidate.filter === agent.filter ? 1 : 0;
      const score = sharedTags * 2 + sameFilter;
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
