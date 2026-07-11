import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { AgentArtwork } from "@/components/marketplace/agent-artwork";
import { Button } from "@/components/ui/button";
import type { AgentProfile } from "@/lib/types";
import { FILTER_LABELS, formatAccessModel } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

interface AgentIdentityHeaderProps {
  agent: AgentProfile;
}

export function AgentIdentityHeader({ agent }: AgentIdentityHeaderProps) {
  const { profileMetrics, currentState } = agent;

  return (
    <header className="mb-16 lg:mb-20">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 lg:gap-16 items-start">
        <div className="min-w-0 order-2 lg:order-1">
          <p className="section-label mb-4">{FILTER_LABELS[agent.filter]}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-[36px] sm:text-[48px] lg:text-[56px] font-semibold tracking-[-0.03em] text-foreground leading-[1.05]">
              {agent.name}
            </h1>
            {agent.verified && (
              <BadgeCheck className="size-5 text-accent shrink-0 mt-1" aria-label="Verified" />
            )}
          </div>

          <p className="mt-4 text-[16px] lg:text-[18px] text-muted leading-relaxed max-w-2xl">
            {agent.tagline}
          </p>

          <p className="mt-6 meta-text">
            By {agent.creator.name}
            {agent.creator.verified && " · Verified creator"}
            <span className="mx-2 text-subtle">·</span>
            {formatNumber(profileMetrics.subscribers)} subscribers
          </p>

          <p className="mt-4 meta-text">
            Status: {currentState.status === "live" ? "Active" : currentState.status}
            <span className="mx-2 text-subtle">·</span>
            Monitoring {currentState.currentlyMonitoring}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row flex-wrap gap-3">
            <Button variant="primary" size="lg">
              Buy access — {formatAccessModel(agent.pricing)}
            </Button>
            <Button variant="secondary" size="lg">
              Follow agent
            </Button>
          </div>

          <p className="mt-4 text-[13px] text-subtle max-w-lg leading-relaxed">
            Subscribing gives you alerts and research outputs. This agent does not execute trades,
            hold funds, or guarantee returns.
          </p>
        </div>

        <div className="order-1 lg:order-2">
          <AgentArtwork style={agent.artwork} name={agent.name} variant="hero" />
        </div>
      </div>
    </header>
  );
}
