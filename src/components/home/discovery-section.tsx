"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { CATEGORY_LABELS, getAgentArt } from "@/lib/data/marketplace-reference";
import type { BusinessStats } from "@/lib/data/real-stats";
import type { AgentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Home discovery built from the real catalog — every business shown exists,
 * every number comes from the database.
 */

interface DiscoverySectionProps {
  agents: AgentSummary[];
  stats: Record<string, BusinessStats>;
}

function statusLine(stats?: BusinessStats): string {
  if (stats?.lastReportAt) return `Last published ${relativeTime(stats.lastReportAt)}`;
  return "Live · reports on demand";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function categoryLabel(agent: AgentSummary): string {
  return CATEGORY_LABELS[agent.slug] ?? agent.filter;
}

export function DiscoverySection({ agents, stats }: DiscoverySectionProps) {
  const featured = agents.find((a) => a.slug === "whale-hunter") ?? agents[0];
  const trending = agents.filter((a) => a.slug !== featured?.slug).slice(0, 5);

  if (!featured) return null;
  const featuredStats = stats[featured.slug];

  return (
    <section id="market" className="relative bg-[#050505] pb-32">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        {/* ---------- featured + trending ---------- */}
        <div className="pt-20 lg:pt-28">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
                Discover
              </p>
              <h2 className="mt-2 text-[26px] sm:text-[30px] font-semibold tracking-[-0.02em] text-foreground">
                Live businesses
              </h2>
            </div>
            <Link
              href="/marketplace"
              className="hidden sm:inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
            >
              View all businesses
              <ArrowRight className="size-3.5" strokeWidth={1.75} />
            </Link>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-14">
            {/* featured */}
            <Link
              href={`/agents/${featured.slug}`}
              className="group relative overflow-hidden rounded-[24px] border border-white/[0.07]"
            >
              <div className="relative aspect-[16/10] sm:aspect-[16/9]">
                <Image
                  src="/images/robots/robot-whale-hero.png"
                  alt={featured.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
              </div>

              <div className="absolute inset-x-0 bottom-0 p-7 sm:p-9">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/60">
                  Featured · {categoryLabel(featured)}
                </p>
                <h3 className="mt-2 text-[30px] sm:text-[38px] font-semibold tracking-[-0.02em] text-white">
                  {featured.name}
                </h3>
                <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/70">
                  {featured.tagline}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-white/60">
                  <span className="flex items-center gap-2 text-white/85">
                    <LiveDot />
                    {statusLine(featuredStats)}
                  </span>
                  <span>
                    {(featuredStats?.subscribers ?? 0).toLocaleString()}{" "}
                    {featuredStats?.subscribers === 1 ? "subscriber" : "subscribers"}
                  </span>
                  <span>
                    {(featuredStats?.reports ?? 0).toLocaleString()}{" "}
                    {featuredStats?.reports === 1 ? "report" : "reports"} published
                  </span>
                </div>

                <span className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-medium text-black transition-transform duration-200 group-hover:scale-[1.03]">
                  Open Business
                  <ArrowRight className="size-3.5" strokeWidth={2} />
                </span>
              </div>
            </Link>

            {/* trending column */}
            <div className="flex flex-col">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                In the catalog
              </p>
              <div className="mt-4 flex flex-1 flex-col">
                {trending.map((agent, i) => (
                  <Link
                    key={agent.slug}
                    href={`/agents/${agent.slug}`}
                    className={cn(
                      "group flex items-center gap-4 border-b border-white/[0.06] py-5 transition-colors",
                      i === 0 && "border-t"
                    )}
                  >
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-xl">
                      <Image
                        src={getAgentArt(agent)}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="44px"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[14.5px] font-medium text-foreground">
                          {agent.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-subtle">
                          {categoryLabel(agent)}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[12.5px] text-muted">
                        <LiveDot small />
                        <span className="truncate">{statusLine(stats[agent.slug])}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[12px] tabular-nums text-muted">
                        {agent.pricing.model === "free" ? "Free" : `$${agent.pricing.amount}/mo`}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wide text-subtle">
                        {(stats[agent.slug]?.subscribers ?? 0).toLocaleString()} subs
                      </span>
                    </span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-subtle transition-all group-hover:translate-x-0.5 group-hover:text-accent"
                      strokeWidth={1.75}
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---------- full catalog row ---------- */}
        <CatalogRow agents={agents} stats={stats} />
      </div>
    </section>
  );
}

/* ================= catalog row ================= */

function CatalogRow({
  agents,
  stats,
}: {
  agents: AgentSummary[];
  stats: Record<string, BusinessStats>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(dir: -1 | 1) {
    scrollRef.current?.scrollBy({ left: dir * 480, behavior: "smooth" });
  }

  return (
    <div className="mt-24 lg:mt-28">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">
            The catalog
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            Every business is a live MCP endpoint you can connect to your tools.
          </p>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <ScrollButton onClick={() => scroll(-1)} direction="left" />
          <ScrollButton onClick={() => scroll(1)} direction="right" />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-hide -mx-6 mt-6 flex snap-x gap-5 overflow-x-auto px-6 pb-2 lg:-mx-10 lg:px-10"
      >
        {agents.map((agent) => (
          <Link
            key={agent.slug}
            href={`/agents/${agent.slug}`}
            className="group w-[210px] shrink-0 snap-start"
          >
            <span className="relative block aspect-square overflow-hidden rounded-2xl border border-white/[0.06]">
              <Image
                src={getAgentArt(agent)}
                alt={agent.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                sizes="210px"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
              <span className="absolute left-3.5 top-3.5 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
                <LiveDot small /> Live
              </span>
            </span>
            <span className="mt-3.5 block px-0.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[14px] font-medium text-foreground">
                  {agent.name}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-subtle">
                  {agent.pricing.model === "free" ? "Free" : `$${agent.pricing.amount}/mo`}
                </span>
              </span>
              <span className="mt-1 block truncate text-[12px] text-muted">
                {statusLine(stats[agent.slug])}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ================= pieces ================= */

function ScrollButton({
  onClick,
  direction,
}: {
  onClick: () => void;
  direction: "left" | "right";
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Scroll ${direction}`}
      className="flex size-8 items-center justify-center rounded-full border border-white/12 text-white/60 transition-colors hover:border-white/30 hover:text-white"
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
}

function LiveDot({ small }: { small?: boolean }) {
  return (
    <span className={cn("relative flex", small ? "size-1.5" : "size-2")}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50" />
      <span className="relative inline-flex size-full rounded-full bg-accent" />
    </span>
  );
}
