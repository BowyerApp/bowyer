/** Platform compatibility — adapted from dukelyuu/skills-marketplace PlatformBadges. */

import type { AgentPlatform } from "@/lib/types";

export type { AgentPlatform };

export interface PlatformInfo {
  id: AgentPlatform;
  name: string;
  short: string;
}

export const PLATFORMS: Record<AgentPlatform, PlatformInfo> = {
  cursor: { id: "cursor", name: "Cursor", short: "Cu" },
  "claude-code": { id: "claude-code", name: "Claude Code", short: "Cl" },
  windsurf: { id: "windsurf", name: "Windsurf", short: "Ws" },
  cline: { id: "cline", name: "Cline", short: "Ci" },
  copilot: { id: "copilot", name: "GitHub Copilot", short: "Gh" },
  "agent-fun": { id: "agent-fun", name: "BOWYER", short: "Bw" },
};

export function getPlatformInfo(id: string): PlatformInfo {
  return PLATFORMS[id as AgentPlatform] ?? { id: id as AgentPlatform, name: id, short: id.slice(0, 2) };
}
