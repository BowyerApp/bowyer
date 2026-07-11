"use client";

import {
  Bot,
  Database,
  FileText,
  Globe,
  LineChart,
  Newspaper,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { MARKETPLACE_CATEGORIES } from "@/lib/data/marketplace-reference";
import type { AgentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  trading: LineChart,
  macro: Globe,
  research: FileText,
  security: ShieldCheck,
  content: Newspaper,
  developer: Bot,
  data: Database,
  automation: Workflow,
};

interface MarketplaceCategoryCarouselProps {
  activeCategory: string | null;
  onSelect: (categoryId: string | null) => void;
  agents: AgentSummary[];
}

export function MarketplaceCategoryCarousel({
  activeCategory,
  onSelect,
  agents,
}: MarketplaceCategoryCarouselProps) {
  return (
    <section className="mt-10 lg:mt-14">
      <div className="-mx-6 lg:-mx-8 overflow-x-auto scrollbar-hide px-6 lg:px-8">
        <div className="flex w-max gap-3 pb-1">
          {MARKETPLACE_CATEGORIES.map((category) => {
            const active = activeCategory === category.id;
            const Icon = CATEGORY_ICONS[category.id] ?? FileText;
            const count = agents.filter(category.filter).length;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => onSelect(active ? null : category.id)}
                className={cn(
                  "group relative flex h-[104px] w-[156px] shrink-0 flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200",
                  active
                    ? "border-accent/60 bg-accent/[0.06]"
                    : "border-border bg-surface hover:border-white/20 hover:bg-[#141414]"
                )}
              >
                {/* quiet top-corner glow */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-white/[0.05] opacity-60 blur-2xl transition-opacity group-hover:opacity-100"
                />
                <Icon
                  className={cn(
                    "size-[18px] transition-colors",
                    active ? "text-accent" : "text-muted group-hover:text-foreground"
                  )}
                  strokeWidth={1.5}
                />
                <span>
                  <span className="block text-[13.5px] font-medium text-foreground">
                    {category.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] tabular-nums text-subtle">
                    {count} {count === 1 ? "business" : "businesses"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
