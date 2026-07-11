import { getAgentSummary, GITHUB_REPOS } from "@/lib/data/agents";
import { getRegisteredDescription } from "@/lib/data/agent-registry";
import type { AgentIdentity } from "@/lib/agent-runtime";

/** Resolve catalog or user-launched agent into runtime identity. */
export function resolveAgentIdentity(slug: string): AgentIdentity | null {
  const agent = getAgentSummary(slug);
  if (!agent) return null;
  return {
    slug,
    name: agent.name,
    tagline: agent.tagline,
    description: getRegisteredDescription(slug) ?? agent.thesis,
  };
}

export { GITHUB_REPOS };
