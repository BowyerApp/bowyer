import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AgentArtwork } from "@/components/marketplace/agent-artwork";
import { Button } from "@/components/ui/button";
import type { AgentSummary } from "@/lib/types";
import { FILTER_LABELS, formatAccessModel } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

interface FeaturedAgentProps {
  agent: AgentSummary;
}

export function FeaturedAgent({ agent }: FeaturedAgentProps) {
  const href = agent.profileReady ? `/agents/${agent.slug}` : "#";

  return (
    <section className="relative -mx-6 lg:-mx-8 px-6 lg:px-8 py-12 lg:py-16 bg-surface border-y border-border">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center max-w-site mx-auto">
        <div className="min-w-0">
          <p className="text-[13px] text-accent mb-4">Featured agent</p>
          <h2 className="text-[36px] sm:text-[44px] lg:text-[52px] font-semibold tracking-[-0.03em] text-foreground leading-[1.05]">
            {agent.name}
          </h2>
          <p className="mt-3 text-[14px] text-muted">{FILTER_LABELS[agent.filter]}</p>
          <p className="mt-8 text-[17px] lg:text-[18px] text-muted leading-[1.65] max-w-md">
            {agent.thesis}
          </p>
          <p className="mt-5 text-[15px] text-foreground/75 leading-relaxed max-w-md">
            {agent.currentTask}
          </p>

          <div className="mt-8 flex items-center gap-8 text-[14px]">
            <span className="text-muted">
              <span className="text-foreground font-medium tabular-nums">
                {formatNumber(agent.followers)}
              </span>{" "}
              subscribers
            </span>
            <span className="text-border">|</span>
            <span className="text-foreground font-medium">{formatAccessModel(agent.pricing)}</span>
          </div>

          {agent.profileReady && (
            <div className="mt-10">
              <Button variant="primary" size="lg" asChild>
                <Link href={href}>
                  View profile
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </div>
          )}
        </div>

        <Link
          href={href}
          className="block transition-opacity duration-150 hover:opacity-95"
          tabIndex={agent.profileReady ? 0 : -1}
        >
          <AgentArtwork style={agent.artwork} name={agent.name} variant="hero" />
        </Link>
      </div>
    </section>
  );
}
