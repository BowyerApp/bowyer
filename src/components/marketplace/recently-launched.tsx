"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AgentCategoryArt } from "@/components/marketplace/category-art";
import { Agent3DTurntable } from "@/components/agent/agent-3d-turntable";
import { getAgentAvatarGlb } from "@/lib/agent-avatars";
import { founderDisplayName } from "@/lib/incubator-shared";
import type { AgentSummary } from "@/lib/types";
import { formatAccessModel } from "@/lib/types";
import { formatUsd } from "@/lib/utils";

interface RecentlyLaunchedProps {
  agents: AgentSummary[];
}

export function RecentlyLaunched({ agents }: RecentlyLaunchedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (agents.length === 0) return null;

  function scroll(dir: "left" | "right") {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -340 : 340, behavior: "smooth" });
  }

  return (
    <section className="py-20 lg:py-28 overflow-hidden">
      <div className="flex items-end justify-between gap-6 mb-12">
        <h2 className="text-[28px] sm:text-[36px] font-semibold tracking-[-0.02em] text-foreground">
          Recently launched
        </h2>
        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll("left")}
            className="flex size-9 items-center justify-center text-muted hover:text-foreground transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            className="flex size-9 items-center justify-center text-muted hover:text-foreground transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-6 px-6 lg:-mx-8 lg:px-8"
      >
        {agents.map((agent) => (
          <RecentlyLaunchedCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}

function RecentlyLaunchedCard({ agent }: { agent: AgentSummary }) {
  const href = agent.profileReady ? `/agents/${agent.slug}` : "#";

  return (
    <Link
      href={href}
      className="snap-start shrink-0 w-[280px] sm:w-[300px] group block"
    >
      {getAgentAvatarGlb(agent) ? (
        <div className="relative aspect-[4/3] mb-4 overflow-hidden">
          <Agent3DTurntable
            glbUrl={getAgentAvatarGlb(agent)!}
            agentName={agent.name}
            fallback={<AgentCategoryArt agent={agent} size="carousel" className="size-full" />}
            className="absolute inset-0"
          />
        </div>
      ) : (
        <AgentCategoryArt agent={agent} size="carousel" className="aspect-[4/3] mb-4" />
      )}
      {agent.foundedBy && (
        <p className="mb-1.5 inline-flex w-fit items-center rounded-sm border border-accent/30 bg-accent/[0.08] px-2 py-0.5 text-[10.5px] font-medium text-accent">
          Founded by AI · {founderDisplayName(agent.foundedBy)}
        </p>
      )}
      <h3 className="text-[17px] font-medium text-foreground group-hover:text-accent transition-colors duration-150">
        {agent.name}
      </h3>
      <p className="mt-1 text-[13px] text-muted line-clamp-1">{agent.tagline}</p>
      <p className="mt-3 text-[13px] text-muted">
        {formatUsd(agent.revenueUsd, true)} · {formatAccessModel(agent.pricing)}
      </p>
    </Link>
  );
}
