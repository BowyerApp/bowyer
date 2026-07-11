import Link from "next/link";
import { AgentArtwork } from "@/components/marketplace/agent-artwork";
import type { AgentSummary } from "@/lib/types";
import { FILTER_LABELS, formatAccessModel } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

interface AgentListRowProps {
  agent: AgentSummary;
  rank: number;
}

export function AgentListRow({ agent, rank }: AgentListRowProps) {
  const href = agent.profileReady ? `/agents/${agent.slug}` : undefined;

  const inner = (
    <div className="group flex items-center gap-5 py-5 transition-opacity duration-150 hover:opacity-80">
      <span className="hidden sm:block w-6 text-[13px] font-mono text-subtle tabular-nums shrink-0">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="size-14 shrink-0 overflow-hidden">
        <AgentArtwork style={agent.artwork} name={agent.name} variant="thumb" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-muted">{FILTER_LABELS[agent.filter]}</p>
        <h3 className="text-[15px] font-medium text-foreground truncate mt-0.5">{agent.name}</h3>
        <p className="text-[13px] text-muted truncate mt-0.5">{agent.tagline}</p>
      </div>
      <div className="hidden md:block text-[13px] text-muted tabular-nums shrink-0">
        {formatNumber(agent.followers)}
      </div>
      <div className="text-[13px] font-medium text-foreground shrink-0 w-20 text-right">
        {formatAccessModel(agent.pricing)}
      </div>
    </div>
  );

  if (!href) return <article className="opacity-50 cursor-default">{inner}</article>;
  return <Link href={href}>{inner}</Link>;
}
