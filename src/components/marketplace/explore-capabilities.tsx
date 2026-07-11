"use client";

import { CAPABILITY_WORLDS, type CapabilityId } from "@/lib/data/marketplace-experience";
import { CategoryArt } from "@/components/marketplace/category-art";
import type { AgentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ExploreCapabilitiesProps {
  agents: AgentSummary[];
  active: CapabilityId | null;
  onSelect: (id: CapabilityId | null) => void;
}

export function ExploreCapabilities({ agents, active, onSelect }: ExploreCapabilitiesProps) {
  return (
    <section className="py-20 lg:py-32">
      <h2 className="text-[28px] sm:text-[36px] font-semibold tracking-[-0.02em] text-foreground mb-4">
        Explore by capability
      </h2>
      <p className="text-[16px] text-muted mb-16 max-w-lg">
        Each category is a different kind of autonomous business.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
        {CAPABILITY_WORLDS.map((world) => {
          const count = agents.filter(world.match).length;
          const isActive = active === world.id;

          return (
            <button
              key={world.id}
              type="button"
              onClick={() => onSelect(isActive ? null : world.id)}
              className={cn(
                "group text-left overflow-hidden transition-opacity duration-200",
                isActive ? "ring-1 ring-accent ring-offset-2 ring-offset-background" : "hover:opacity-90"
              )}
            >
              <CategoryArt
                capability={world.id}
                name={world.label}
                size="tile"
                className="aspect-[16/10] sm:aspect-[4/3]"
              />
              <div className="pt-5 pb-2">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[20px] font-medium text-foreground">{world.label}</h3>
                  <span className="text-[13px] text-muted tabular-nums">{count}</span>
                </div>
                <p className="mt-2 text-[14px] text-muted leading-relaxed">{world.tagline}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
