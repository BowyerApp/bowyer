"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import {
  CATEGORY_LABELS,
  getAgentArt,
  TOP_BUSINESSES_TABS,
  formatCompactCount,
  type TopBusinessesTab,
} from "@/lib/data/marketplace-reference";
import type { BusinessStats } from "@/lib/data/real-stats";
import type { AgentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MarketplaceTopBusinessesProps {
  agents: AgentSummary[];
  stats: Record<string, BusinessStats>;
  tab: TopBusinessesTab;
  onTabChange: (tab: TopBusinessesTab) => void;
}

export function MarketplaceTopBusinesses({
  agents,
  stats,
  tab,
  onTabChange,
}: MarketplaceTopBusinessesProps) {
  const [lead, ...rest] = agents;
  const side = rest.slice(0, 2);
  const rows = rest.slice(2);

  return (
    <section className="mt-12 lg:mt-16 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.02em] text-foreground">
            Top businesses
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Live MCP endpoints — every metric is real.
          </p>
        </div>
        <Link
          href="/marketplace"
          className="text-[13px] text-muted transition-colors hover:text-foreground"
        >
          View all
        </Link>
      </div>

      <div className="mt-6 flex gap-6 border-b border-border overflow-x-auto scrollbar-hide">
        {TOP_BUSINESSES_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={cn(
              "shrink-0 pb-3 text-[13px] transition-colors border-b-2 -mb-px",
              tab === id
                ? "text-foreground border-accent"
                : "text-muted border-transparent hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {agents.length === 0 ? (
        <p className="mt-10 text-[14px] text-muted">No businesses match this view yet.</p>
      ) : (
        <>
          {/* lead + two supporting cards */}
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {lead && <LeadCard agent={lead} stats={stats[lead.slug]} />}
            <div className="flex flex-col gap-5">
              {side.map((agent) => (
                <SideCard key={agent.slug} agent={agent} stats={stats[agent.slug]} />
              ))}
            </div>
          </div>

          {/* editorial rows */}
          {rows.length > 0 && (
            <div className="mt-10">
              {rows.map((agent, i) => (
                <BusinessRow
                  key={agent.slug}
                  agent={agent}
                  stats={stats[agent.slug]}
                  first={i === 0}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ================= cards ================= */

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function bits(agent: AgentSummary, stats?: BusinessStats) {
  return {
    art: getAgentArt(agent),
    category: CATEGORY_LABELS[agent.slug] ?? agent.filter,
    verified: agent.creator.verified || agent.profileReady,
    subscribers: stats?.subscribers ?? 0,
    reports: stats?.reports ?? 0,
    confidence:
      stats?.avgConfidence != null ? `${Math.round(stats.avgConfidence * 100)}%` : "—",
    statusLine: stats?.lastReportAt
      ? `Last published ${relativeTime(stats.lastReportAt)}`
      : "Live · reports generate on demand",
  };
}

function LiveLine({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-muted">
      <span className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50" />
        <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
      </span>
      <span className="truncate">{text}</span>
    </span>
  );
}

function priceLabel(agent: AgentSummary): string {
  return agent.pricing.model === "free" || agent.pricing.amount <= 0
    ? "Free"
    : `$${agent.pricing.amount}/mo`;
}

function LeadCard({ agent, stats }: { agent: AgentSummary; stats?: BusinessStats }) {
  const b = bits(agent, stats);

  return (
    <Link
      href={`/agents/${agent.slug}`}
      className="group flex flex-col overflow-hidden rounded-[20px] bg-surface transition-colors hover:bg-[#141414] lg:col-span-2"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <Image
          src={b.art}
          alt=""
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
          sizes="(max-width: 1024px) 100vw, 800px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
          {b.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center gap-2">
          <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">
            {agent.name}
          </h3>
          {b.verified && <BadgeCheck className="size-4 text-accent" strokeWidth={2} />}
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted line-clamp-2 max-w-xl">
          {agent.tagline}
        </p>

        <div className="mt-4">
          <LiveLine text={b.statusLine} />
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Stat value={formatCompactCount(b.subscribers)} label="Subscribers" />
            <Stat value={String(b.reports)} label="Reports" />
            <Stat value={b.confidence} label="Avg confidence" />
            <Stat value={priceLabel(agent)} label="Price" />
            {agent.stars > 0 && (
              <Stat value={formatCompactCount(agent.stars)} label="GitHub stars" />
            )}
          </div>
          <span className="flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-muted transition-colors group-hover:bg-accent group-hover:text-background">
            <ArrowRight className="size-4" strokeWidth={2} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function SideCard({ agent, stats }: { agent: AgentSummary; stats?: BusinessStats }) {
  const b = bits(agent, stats);

  return (
    <Link
      href={`/agents/${agent.slug}`}
      className="group flex flex-1 flex-col overflow-hidden rounded-[20px] bg-surface transition-colors hover:bg-[#141414]"
    >
      <div className="relative aspect-[16/7] overflow-hidden">
        <Image
          src={b.art}
          alt=""
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          sizes="(max-width: 1024px) 100vw, 420px"
        />
        <span className="absolute left-3.5 top-3.5 rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
          {b.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[15.5px] font-semibold text-foreground">{agent.name}</h3>
          {b.verified && <BadgeCheck className="size-3.5 text-accent" strokeWidth={2} />}
        </div>
        <div className="mt-2">
          <LiveLine text={b.statusLine} />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5 text-[12px] text-subtle">
          <span>
            <span className="tabular-nums text-foreground">
              {formatCompactCount(b.subscribers)}
            </span>{" "}
            subscribers
          </span>
          <span>{priceLabel(agent)}</span>
        </div>
      </div>
    </Link>
  );
}

function BusinessRow({
  agent,
  stats,
  first,
}: {
  agent: AgentSummary;
  stats?: BusinessStats;
  first: boolean;
}) {
  const b = bits(agent, stats);

  return (
    <Link
      href={`/agents/${agent.slug}`}
      className={cn(
        "group grid items-center gap-x-6 gap-y-2 border-b border-border py-5 sm:grid-cols-[56px_minmax(200px,1.2fr)_1fr_auto]",
        first && "border-t"
      )}
    >
      <span className="relative hidden size-14 overflow-hidden rounded-xl sm:block">
        <Image src={b.art} alt="" fill className="object-cover" sizes="56px" />
      </span>

      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-medium text-foreground">{agent.name}</span>
          {b.verified && <BadgeCheck className="size-3.5 shrink-0 text-accent" strokeWidth={2} />}
          <span className="ml-1 hidden shrink-0 text-[11px] text-subtle sm:inline">{b.category}</span>
        </span>
        <span className="mt-1 block truncate text-[12.5px] text-muted">{agent.tagline}</span>
      </span>

      <LiveLine text={b.statusLine} />

      <span className="flex items-center gap-8">
        <span className="hidden text-[12px] text-subtle md:block">
          <span className="tabular-nums text-foreground">
            {formatCompactCount(b.subscribers)}
          </span>{" "}
          subs
        </span>
        <span className="hidden text-[12px] text-subtle md:block">{priceLabel(agent)}</span>
        <ArrowRight
          className="size-3.5 text-subtle transition-all group-hover:translate-x-0.5 group-hover:text-accent"
          strokeWidth={1.75}
        />
      </span>
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[15px] font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-subtle">{label}</p>
    </div>
  );
}
