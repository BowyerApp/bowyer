"use client";

import Link from "next/link";
import type { PlatformEvent } from "@/lib/data/real-stats";

/**
 * Real activity feed: published reports and new subscriptions from the
 * database. Nothing simulated — empty state when nothing has happened yet.
 */

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

function displayName(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MarketplaceLiveFeed({ events }: { events: PlatformEvent[] }) {
  return (
    <aside className="flex flex-col pt-2 lg:absolute lg:inset-0 lg:pt-6">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50" />
          <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
        </span>
        Recent activity
      </h2>

      {events.length === 0 ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          Reports and new subscriptions appear here as they happen. Subscribe to a business
          and generate its first report to get things moving.
        </p>
      ) : (
        <div className="relative mt-4 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <ul className="flex flex-col gap-4">
            {events.map((item, i) => (
              <li key={`${item.slug}-${item.at}-${i}`} className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-medium text-foreground/90">
                  {displayName(item.business).charAt(0)}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[13px] leading-snug">
                    <Link
                      href={`/agents/${item.slug}`}
                      className="font-medium text-foreground hover:text-accent"
                    >
                      {displayName(item.business)}
                    </Link>{" "}
                    <span className="text-muted">{item.action}</span>
                  </p>
                  {/* time text drifts between SSR and hydration — expected */}
                  <p suppressHydrationWarning className="mt-0.5 text-[11px] tabular-nums text-subtle">
                    {ago(item.at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {/* entries past the featured card's height fade out instead of
              stretching the hero row into dead space */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-16 bg-gradient-to-t from-background to-transparent lg:block"
          />
        </div>
      )}
    </aside>
  );
}
