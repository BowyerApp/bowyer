"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AgentArtwork } from "@/components/marketplace/agent-artwork";
import { AgentListRow } from "@/components/marketplace/agent-list-row";
import { Agent3DTurntable } from "@/components/agent/agent-3d-turntable";
import { getAgentAvatarGlb } from "@/lib/agent-avatars";
import { CommandPaletteHint } from "@/components/marketplace/command-palette";
import type { AgentSummary, CatalogView, MarketplaceFilter, MarketplaceTab } from "@/lib/types";
import { FILTER_LABELS, TAB_LABELS, formatAccessModel } from "@/lib/types";
import { filterAgentsByTab } from "@/lib/data/agents";
import { cn, formatNumber } from "@/lib/utils";

const TABS: MarketplaceTab[] = ["trending", "new", "most-used"];

interface MarketplaceCatalogProps {
  agents: AgentSummary[];
}

export function MarketplaceCatalog({ agents }: MarketplaceCatalogProps) {
  const [tab, setTab] = useState<MarketplaceTab>("trending");
  const [filter, setFilter] = useState<MarketplaceFilter | "all">("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CatalogView>("grid");

  const filtered = useMemo(() => {
    let list = filterAgentsByTab(agents, tab).filter((a) => !a.featured);
    if (filter !== "all") list = list.filter((a) => a.filter === filter);
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tagline.toLowerCase().includes(q) ||
          a.creator.name.toLowerCase().includes(q) ||
          a.tags.some((t) => t.includes(q))
      );
    }
    return list;
  }, [agents, tab, filter, query]);

  return (
    <div>
      <div className="flex flex-col gap-6 mb-10 pb-8 border-b border-border sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.02em] text-foreground">
            All agents
          </h2>
          <p className="mt-2 text-[14px] text-muted">{filtered.length} available</p>
        </div>
        <CommandPaletteHint />
      </div>

      <div className="flex flex-col gap-4 mb-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "shrink-0 px-3 py-2 text-[14px] rounded-sm transition-colors",
                tab === t
                  ? "bg-surface text-foreground"
                  : "text-muted hover:text-foreground"
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="input-dark h-9 w-full sm:w-48 text-[14px]"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as MarketplaceFilter | "all")}
            className="input-dark h-9 text-[14px] min-w-[130px]"
          >
            <option value="all">All categories</option>
            {(Object.keys(FILTER_LABELS) as MarketplaceFilter[]).map((f) => (
              <option key={f} value={f}>
                {FILTER_LABELS[f]}
              </option>
            ))}
          </select>
          <div className="hidden sm:flex items-center gap-1 text-[13px] text-muted">
            <button type="button" onClick={() => setView("grid")} className={cn("px-2 py-1", view === "grid" && "text-foreground")}>
              Grid
            </button>
            <span className="text-subtle">·</span>
            <button type="button" onClick={() => setView("list")} className={cn("px-2 py-1", view === "list" && "text-foreground")}>
              List
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-muted">No agents match your search.</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-10">
          {filtered.map((agent) => (
            <AgentGridItem key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {filtered.map((agent, i) => (
            <AgentListRow key={agent.id} agent={agent} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentGridItem({ agent }: { agent: AgentSummary }) {
  const href = agent.profileReady ? `/agents/${agent.slug}` : undefined;

  const inner = (
    <article className="group h-full flex flex-col">
      <div className="relative aspect-[16/10] overflow-hidden mb-4 transition-opacity duration-150 group-hover:opacity-90">
        {getAgentAvatarGlb(agent) ? (
          <Agent3DTurntable
            glbUrl={getAgentAvatarGlb(agent)!}
            agentName={agent.name}
            fallback={<AgentArtwork style={agent.artwork} name={agent.name} variant="card" className="size-full" />}
            className="absolute inset-0"
          />
        ) : (
          <AgentArtwork style={agent.artwork} name={agent.name} variant="card" />
        )}
      </div>
      <p className="text-[12px] text-muted uppercase tracking-wide">{FILTER_LABELS[agent.filter]}</p>
      <h3 className="mt-1.5 text-[17px] font-medium text-foreground leading-snug group-hover:text-accent transition-colors duration-150">
        {agent.name}
      </h3>
      <p className="mt-2 text-[14px] text-muted leading-relaxed line-clamp-2 flex-1">{agent.tagline}</p>
      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted tabular-nums">{formatNumber(agent.followers)} subs</span>
        <span className="text-[13px] font-medium text-foreground">{formatAccessModel(agent.pricing)}</span>
      </div>
    </article>
  );

  if (!href) return <div className="opacity-50 cursor-default">{inner}</div>;
  return <Link href={href} className="block h-full">{inner}</Link>;
}
