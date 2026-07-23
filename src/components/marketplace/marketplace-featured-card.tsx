"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { Agent3DTurntable } from "@/components/agent/agent-3d-turntable";
import { getAgentAvatarGlb } from "@/lib/agent-avatars";
import type { BusinessStats } from "@/lib/data/real-stats";
import type { AgentSummary } from "@/lib/types";

interface MarketplaceFeaturedCardProps {
  agent: AgentSummary;
  stats?: BusinessStats;
}

export function MarketplaceFeaturedCard({ agent, stats }: MarketplaceFeaturedCardProps) {
  const reports = stats?.reports ?? 0;
  const subscribers = stats?.subscribers ?? 0;
  const confidence =
    stats?.avgConfidence != null ? `${Math.round(stats.avgConfidence * 100)}%` : "—";
  const lastPublished = stats?.lastReportAt ? relativeTime(stats.lastReportAt) : "—";
  const avatarGlb = getAgentAvatarGlb(agent);

  return (
    <Link
      href={`/agents/${agent.slug}`}
      className="group relative block overflow-hidden rounded-[20px] bg-surface min-h-[320px] lg:min-h-[380px]"
    >
      {avatarGlb ? (
        <>
          {/* live model pinned right, copy stays readable on the left */}
          <div className="absolute inset-y-0 right-0 w-[58%] sm:w-1/2">
            <Agent3DTurntable
              glbUrl={avatarGlb}
              agentName={agent.name}
              posterSrc="/images/robots/robot-whale-hero.png"
              className="absolute inset-0"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black via-black/45 to-transparent" />
        </>
      ) : (
        <Image
          src="/images/robots/robot-whale-hero.png"
          alt=""
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          sizes="(max-width: 1024px) 100vw, 640px"
          priority
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />

      <span className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium text-foreground backdrop-blur-sm">
        Featured
      </span>

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                {agent.name}
              </h2>
              <BadgeCheck className="size-4 shrink-0 text-accent" strokeWidth={2} />
            </div>
            <p className="mt-1.5 text-[13px] text-white/70 line-clamp-2 max-w-[420px]">
              {agent.tagline}
            </p>

            {/* live endpoint indicator — a true statement, not simulated activity */}
            <div className="mt-3.5 flex min-w-0 items-center gap-2 text-[12.5px] text-white/85 [&>span]:truncate">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
              </span>
              <span>Live MCP endpoint · reports on demand</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <Metric label="Subscribers" value={subscribers.toLocaleString()} accent />
              <Metric label="Reports" value={reports.toLocaleString()} />
              <Metric label="Avg confidence" value={confidence} />
              <Metric label="Last published" value={lastPublished} />
            </div>
          </div>

          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-background transition-transform group-hover:scale-105">
            <ArrowRight className="size-5" strokeWidth={2} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      {/* "Last published" drifts between SSR and hydration — expected */}
      <p
        suppressHydrationWarning
        className={`text-[15px] font-semibold tabular-nums ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </p>
      <p className="text-[11px] text-white/50">{label}</p>
    </div>
  );
}
