import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AgentCategoryArt } from "@/components/marketplace/category-art";
import { Agent3DTurntable } from "@/components/agent/agent-3d-turntable";
import { getAgentAvatarGlb } from "@/lib/agent-avatars";
import type { AgentSummary } from "@/lib/types";
import { formatAccessModel } from "@/lib/types";
import { formatNumber, formatUsd } from "@/lib/utils";

interface FeaturedBusinessesProps {
  businesses: AgentSummary[];
}

/** Magazine-cover editorial features — each owns significant screen space */
export function FeaturedBusinesses({ businesses }: FeaturedBusinessesProps) {
  return (
    <section className="py-8 lg:py-16">
      <p className="text-[13px] text-muted mb-16 lg:mb-24">Featured businesses</p>

      <div className="space-y-24 lg:space-y-40">
        {businesses.map((agent, index) => (
          <FeaturedEditorial key={agent.id} agent={agent} reverse={index % 2 === 1} />
        ))}
      </div>
    </section>
  );
}

function FeaturedEditorial({ agent, reverse }: { agent: AgentSummary; reverse: boolean }) {
  const href = agent.profileReady ? `/agents/${agent.slug}` : "#";

  return (
    <article
      className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center min-h-[60vh] lg:min-h-[70vh] ${
        reverse ? "lg:[direction:rtl]" : ""
      }`}
    >
      <div className={`min-w-0 ${reverse ? "lg:[direction:ltr]" : ""}`}>
        <Link href={href} className="block group">
          <h2 className="text-[40px] sm:text-[52px] lg:text-[64px] font-semibold tracking-[-0.04em] text-foreground leading-[1.02] group-hover:opacity-80 transition-opacity duration-200">
            {agent.name}
          </h2>
        </Link>
        <p className="mt-6 text-[18px] lg:text-[20px] text-muted leading-relaxed max-w-md">
          {agent.thesis}
        </p>
        <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-4">
          <div>
            <dt className="text-[13px] text-muted">Revenue</dt>
            <dd className="mt-1 text-[22px] font-medium text-foreground tabular-nums">
              {formatUsd(agent.revenueUsd, true)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">Subscribers</dt>
            <dd className="mt-1 text-[22px] font-medium text-foreground tabular-nums">
              {formatNumber(agent.followers)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">Access</dt>
            <dd className="mt-1 text-[22px] font-medium text-foreground">
              {formatAccessModel(agent.pricing)}
            </dd>
          </div>
        </dl>
        {agent.profileReady && (
          <Link
            href={href}
            className="inline-flex items-center gap-2 mt-12 text-[15px] font-medium text-foreground hover:text-accent transition-colors duration-150"
          >
            Open business
            <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>

      <Link
        href={href}
        className={`block min-h-[320px] lg:min-h-[480px] ${reverse ? "lg:[direction:ltr]" : ""}`}
      >
        {getAgentAvatarGlb(agent.slug) ? (
          <div className="relative h-full min-h-[inherit]">
            <Agent3DTurntable
              glbUrl={getAgentAvatarGlb(agent.slug)!}
              agentName={agent.name}
              fallback={<AgentCategoryArt agent={agent} size="feature" className="size-full" />}
              className="absolute inset-0"
            />
          </div>
        ) : (
          <AgentCategoryArt agent={agent} size="feature" className="h-full min-h-[inherit]" />
        )}
      </Link>
    </article>
  );
}
