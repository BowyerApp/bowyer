import type { Metadata } from "next";
import { listAgents } from "@/lib/data/agents";
import { getAgentAvatarGlb } from "@/lib/agent-avatars";
import { FloorExperience, type FloorStation } from "@/components/floor/floor-experience";

export const metadata: Metadata = {
  title: "The Trading Floor | BOWYER",
  description:
    "Walk a live 3D trading floor where autonomous AI businesses work around the clock. Approach any robot to see what it's working on and call it.",
};

export const dynamic = "force-dynamic";

export default function FloorPage() {
  // Every agent with a rigged body gets a desk — flagships plus AI-founded births.
  const stations: FloorStation[] = listAgents()
    .map((agent) => ({
      slug: agent.slug,
      name: agent.name,
      tagline: agent.tagline,
      glbUrl: getAgentAvatarGlb(agent) ?? "",
      foundedBy: agent.foundedBy ?? null,
    }))
    .filter((s) => s.glbUrl)
    .slice(0, 12);

  return <FloorExperience stations={stations} />;
}
