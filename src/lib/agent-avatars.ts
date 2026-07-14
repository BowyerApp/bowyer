/**
 * 3D avatar GLB paths for catalog agents (three.ws `<agent-3d>` embed).
 * Models are rigged via three.ws POST /api/forge?action=rig.
 * Custom avatars: https://three.ws/create/prompt → export → POST /api/agents/[slug]/avatar
 */

/** Every public catalog agent gets a local rigged GLB. */
export const AGENT_AVATAR_GLB: Record<string, string> = {
  "robinhood-trading-agent": "/models/agents/robinhood-trading-agent.glb",
  "whale-hunter": "/models/agents/whale-hunter.glb",
  "hood-meme-radar": "/models/agents/hood-meme-radar.glb",
  "gpt-researcher": "/models/agents/gpt-researcher.glb",
  autogpt: "/models/agents/autogpt.glb",
  openhands: "/models/agents/openhands.glb",
};

export const RIGGED_AGENTS = new Set(Object.keys(AGENT_AVATAR_GLB));

export function getAgentAvatarGlb(slug: string): string | null {
  return AGENT_AVATAR_GLB[slug] ?? null;
}

export function isRiggedAgent(slug: string): boolean {
  return RIGGED_AGENTS.has(slug);
}

export const THREE_WS_AGENT_CDN =
  process.env.NEXT_PUBLIC_THREE_WS_CDN?.trim() || "https://three.ws/agent-3d/latest/agent-3d.js";
