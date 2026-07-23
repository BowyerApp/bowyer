import Link from "next/link";
import { AgentCategoryArt } from "@/components/marketplace/category-art";
import { Agent3DTurntable } from "@/components/agent/agent-3d-turntable";
import { getAgentAvatarGlb } from "@/lib/agent-avatars";
import { founderDisplayName } from "@/lib/incubator-shared";
import { RevenueRankChip } from "@/components/marketplace/revenue-rank-chip";
import type { AgentSummary } from "@/lib/types";
import { formatAccessModel } from "@/lib/types";
import { formatNumber, formatUsd } from "@/lib/utils";

interface BusinessGridProps {
  agents: AgentSummary[];
  title?: string;
}

/** Collectible listing cards — artwork, name, sentence, revenue, subs, price */
export function BusinessGrid({ agents, title = "All businesses" }: BusinessGridProps) {
  if (agents.length === 0) {
    return (
      <section id="businesses" className="py-20 lg:py-28">
        <h2 className="text-[28px] sm:text-[36px] font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        <p className="mt-8 text-[16px] text-muted">No businesses match your search.</p>
      </section>
    );
  }

  return (
    <section id="businesses" className="py-20 lg:py-28">
      <div className="flex items-baseline justify-between gap-6 mb-16 lg:mb-20">
        <h2 className="text-[28px] sm:text-[36px] font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        <span className="text-[14px] text-muted tabular-nums">{agents.length}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-16 lg:gap-y-20">
        {agents.map((agent) => (
          <BusinessCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}

function BusinessCard({ agent }: { agent: AgentSummary }) {
  const href = agent.profileReady ? `/agents/${agent.slug}` : undefined;

  const inner = (
    <article className="group flex flex-col h-full">
      <div className="overflow-hidden mb-6 transition-opacity duration-200 group-hover:opacity-85">
        {getAgentAvatarGlb(agent) ? (
          <div className="relative aspect-[4/5] sm:aspect-[3/4]">
            <Agent3DTurntable
              glbUrl={getAgentAvatarGlb(agent)!}
              agentName={agent.name}
              fallback={<AgentCategoryArt agent={agent} size="card" className="size-full" />}
              className="absolute inset-0"
            />
          </div>
        ) : (
          <AgentCategoryArt agent={agent} size="card" className="aspect-[4/5] sm:aspect-[3/4]" />
        )}
      </div>
      <span className="mb-2 flex flex-wrap items-center gap-1.5 empty:mb-0 empty:hidden">
        {agent.foundedBy && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-accent/30 bg-accent/[0.08] px-2 py-0.5 text-[11px] font-medium text-accent">
            Founded by AI · {founderDisplayName(agent.foundedBy)}
          </span>
        )}
        <RevenueRankChip slug={agent.slug} />
      </span>
      <h3 className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.02em] text-foreground leading-tight group-hover:text-accent transition-colors duration-150">
        {agent.name}
      </h3>
      <p className="mt-3 text-[15px] text-muted leading-relaxed line-clamp-2 flex-1">
        {agent.tagline}
      </p>
      <dl className="mt-6 pt-6 border-t border-border grid grid-cols-3 gap-4">
        <div>
          <dt className="text-[11px] text-muted uppercase tracking-wide">Revenue</dt>
          <dd className="mt-1 text-[14px] font-medium text-foreground tabular-nums">
            {formatUsd(agent.revenueUsd, true)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted uppercase tracking-wide">Subs</dt>
          <dd className="mt-1 text-[14px] font-medium text-foreground tabular-nums">
            {formatNumber(agent.followers)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted uppercase tracking-wide">Price</dt>
          <dd className="mt-1 text-[14px] font-medium text-foreground">
            {formatAccessModel(agent.pricing)}
          </dd>
        </div>
      </dl>
    </article>
  );

  if (!href) return <div className="opacity-50">{inner}</div>;
  return <Link href={href}>{inner}</Link>;
}
