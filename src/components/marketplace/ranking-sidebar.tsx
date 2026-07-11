import Link from "next/link";
import { Trophy } from "lucide-react";
import type { AgentSummary } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";

interface RankingSidebarProps {
  agents: AgentSummary[];
}

export function RankingSidebar({ agents }: RankingSidebarProps) {
  const ranked = [...agents].sort((a, b) => b.stars - a.stars).slice(0, 10);

  return (
    <aside className="hidden xl:block">
      <GlassCard className="overflow-hidden sticky top-24">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <Trophy className="size-3.5 text-[#D7FF00]" />
          <h3 className="text-[12px] font-medium text-white uppercase tracking-wider">Top agents</h3>
        </div>
        <ol className="divide-y divide-white/[0.04]">
          {ranked.map((agent, i) => (
            <li key={agent.id}>
              <Link
                href={agent.profileReady ? `/agents/${agent.slug}` : "#"}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors group"
              >
                <span
                  className={`w-4 text-center text-[11px] font-mono tabular-nums shrink-0 ${
                    i < 3 ? "text-[#D7FF00]" : "text-white/30"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-white truncate group-hover:text-[#D7FF00] transition-colors">
                    {agent.name}
                  </p>
                  <p className="text-[10px] text-white/35 truncate">{agent.creator.name}</p>
                </div>
                <span className="text-[11px] text-white/40 tabular-nums shrink-0">
                  {formatNumber(agent.stars)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </GlassCard>
    </aside>
  );
}
