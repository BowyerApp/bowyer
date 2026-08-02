import type { Metadata } from "next";
import { listAgents } from "@/lib/data/agents";
import { getAgentArt, CATEGORY_LABELS } from "@/lib/data/marketplace-reference";
import { MyAgentsView, type AgentCard } from "@/components/terminal/my-agents";

export const metadata: Metadata = {
  title: "My agents — BOWYER V2",
  description: "The autonomous businesses your wallet runs.",
};

export default function MyAgentsPage() {
  const agents: AgentCard[] = listAgents().map((a) => ({
    slug: a.slug,
    name: a.name,
    tagline: a.tagline,
    categoryLabel: CATEGORY_LABELS[a.slug] ?? a.category,
    art: getAgentArt(a),
    priceUsd: a.pricing.amount,
  }));
  return <MyAgentsView agents={agents} />;
}
