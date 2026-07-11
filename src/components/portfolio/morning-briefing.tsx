"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { useWallet } from "@/lib/wallet-context";
import type { AgentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Morning briefing built entirely from real wallet data: businesses you own,
 * subscriptions you hold, payments you received, and actual platform activity.
 */

interface SubscriptionRow {
  slug: string;
  subscriber: string;
  txHash?: string;
  amountUsd: number;
  at: string;
}

interface PlatformEvent {
  business: string;
  slug: string;
  action: string;
  at: string;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
}

function displayName(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function MorningBriefing() {
  const { address } = useWallet();
  const [owned, setOwned] = useState<AgentSummary[] | null>(null);
  const [subs, setSubs] = useState<SubscriptionRow[] | null>(null);
  const [earnings, setEarnings] = useState<SubscriptionRow[] | null>(null);
  const [events, setEvents] = useState<PlatformEvent[] | null>(null);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/agents?owner=${address}`)
      .then((r) => r.json())
      .then((d) => setOwned(d.agents ?? []))
      .catch(() => setOwned([]));
    fetch(`/api/subscriptions?subscriber=${address}`)
      .then((r) => r.json())
      .then((d) => setSubs(d.subscriptions ?? []))
      .catch(() => setSubs([]));
    fetch(`/api/subscriptions?creator=${address}`)
      .then((r) => r.json())
      .then((d) => setEarnings(d.subscriptions ?? []))
      .catch(() => setEarnings([]));
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .catch(() => setEvents([]));
  }, [address]);

  const loading = owned === null || subs === null || earnings === null || events === null;

  if (loading) {
    return (
      <Container className="pt-12 pb-24">
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </Container>
    );
  }

  const totalEarned = earnings.reduce((s, e) => s + e.amountUsd, 0);
  const hasAnything = owned.length > 0 || subs.length > 0;

  return (
    <Container className="step-enter pt-12 pb-24">
      {/* ---------- headline ---------- */}
      <h1 className="max-w-2xl text-[34px] sm:text-[44px] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">
        {greeting()}
        {hasAnything ? (
          <span className="text-muted"> Here&apos;s where your businesses stand.</span>
        ) : (
          <span className="text-muted"> Your workforce starts here.</span>
        )}
      </h1>

      {/* ---------- real summary ---------- */}
      <div className="mt-10 flex flex-wrap gap-x-14 gap-y-6 border-y border-border py-7">
        <Summary value={String(owned.length)} label={owned.length === 1 ? "Business owned" : "Businesses owned"} />
        <Summary value={String(subs.length)} label={subs.length === 1 ? "Active subscription" : "Active subscriptions"} />
        <Summary value={`$${totalEarned.toLocaleString()}`} label="Total earned" accent={totalEarned > 0} />
        <Summary value={String(earnings.length)} label={earnings.length === 1 ? "Subscriber" : "Subscribers"} />
      </div>

      {/* ---------- empty state ---------- */}
      {!hasAnything && (
        <div className="mt-10 max-w-xl">
          <p className="text-[15px] leading-relaxed text-muted">
            You don&apos;t own or subscribe to any businesses yet. Launch one in about two
            minutes, or subscribe to one from the marketplace — everything it publishes will
            land here.
          </p>
          <div className="mt-7 flex flex-wrap gap-4">
            <Link
              href="/launch"
              className="flex h-11 items-center gap-2 rounded-sm bg-accent px-6 text-[14px] font-medium text-background transition-opacity hover:opacity-90"
            >
              Launch a business <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
            <Link
              href="/marketplace"
              className="flex h-11 items-center gap-2 rounded-sm border border-border px-6 text-[14px] text-foreground transition-colors hover:border-white/25"
            >
              Explore the marketplace
            </Link>
          </div>
        </div>
      )}

      {/* ---------- owned businesses ---------- */}
      {owned.length > 0 && (
        <div className="mt-12">
          <h2 className="section-heading">Your businesses</h2>
          <div className="mt-5 max-w-3xl">
            {owned.map((a, i) => (
              <Link
                key={a.slug}
                href={`/agents/${a.slug}`}
                className={cn(
                  "group grid items-center gap-x-6 gap-y-1 border-b border-border py-5 sm:grid-cols-[1fr_auto_auto]",
                  i === 0 && "border-t"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15.5px] font-medium text-foreground transition-colors group-hover:text-accent">
                    {a.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                    {a.tagline}
                  </span>
                </span>
                <span className="text-[13px] tabular-nums text-muted">
                  {a.pricing.model === "free" ? "Free" : `$${a.pricing.amount}/mo`}
                </span>
                <ArrowUpRight
                  className="size-4 text-subtle transition-colors group-hover:text-accent"
                  strokeWidth={1.75}
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ---------- subscriptions ---------- */}
      {subs.length > 0 && (
        <div className="mt-12">
          <h2 className="section-heading">Working for you</h2>
          <div className="mt-5 max-w-3xl">
            {subs.map((s, i) => (
              <Link
                key={`${s.slug}-${s.at}`}
                href={`/agents/${s.slug}`}
                className={cn(
                  "group grid items-center gap-x-6 border-b border-border py-5 sm:grid-cols-[1fr_auto_auto]",
                  i === 0 && "border-t"
                )}
              >
                <span className="truncate text-[15px] font-medium text-foreground transition-colors group-hover:text-accent">
                  {displayName(s.slug)}
                </span>
                <span className="text-[12.5px] tabular-nums text-subtle">
                  since{" "}
                  {new Date(s.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span className="text-[13px] tabular-nums text-muted">
                  {s.amountUsd > 0 ? `$${s.amountUsd}/mo` : "Free"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ---------- real activity ---------- */}
      <div className="mt-12">
        <h2 className="section-heading">Latest activity</h2>
        {events.length === 0 ? (
          <p className="mt-5 max-w-lg text-[13.5px] leading-relaxed text-muted">
            Published reports and new subscriptions show up here in real time. Connect a
            business to your tools and call{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">
              generate_report
            </code>{" "}
            to see it move.
          </p>
        ) : (
          <div className="mt-5 max-w-3xl">
            {events.map((e, i) => (
              <div
                key={`${e.slug}-${e.at}-${i}`}
                className={cn(
                  "grid grid-cols-[64px_1fr] items-baseline gap-x-6 border-b border-border py-4",
                  i === 0 && "border-t"
                )}
              >
                <span className="font-mono text-[12px] tabular-nums text-subtle">
                  {ago(e.at)}
                </span>
                <p className="text-[13.5px] leading-snug">
                  <Link
                    href={`/agents/${e.slug}`}
                    className="font-medium text-foreground hover:text-accent"
                  >
                    {displayName(e.business)}
                  </Link>{" "}
                  <span className="text-muted">{e.action}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}

function Summary({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          "text-[28px] font-semibold tabular-nums tracking-[-0.02em]",
          accent ? "text-accent" : "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[12px] text-muted">{label}</p>
    </div>
  );
}
