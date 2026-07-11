import Link from "next/link";
import type { AgentSummary } from "@/lib/types";

export function RelatedAgents({ agents }: { agents: AgentSummary[] }) {
  if (!agents.length) return null;

  return (
    <section className="pt-8 border-t border-border">
      <h2 className="text-[22px] font-semibold text-foreground mb-6">Related agents</h2>
      <ul className="divide-y divide-border border-t border-border">
        {agents.map((agent) => (
          <li key={agent.id}>
            <Link
              href={agent.profileReady ? `/agents/${agent.slug}` : "#"}
              className="flex items-baseline justify-between gap-4 py-5 group"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-foreground group-hover:text-accent transition-colors duration-150 truncate">
                  {agent.name}
                </p>
                <p className="meta-text truncate mt-1">{agent.tagline}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
