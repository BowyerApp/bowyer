"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Copy, Check } from "lucide-react";
import { Container } from "@/components/layout/container";
import { ConnectGate } from "@/components/layout/wallet-button";
import { MorningBriefing } from "@/components/portfolio/morning-briefing";
import { shortAddress, useWallet } from "@/lib/wallet-context";
import type { AgentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "briefing", label: "Briefing" },
  { id: "businesses", label: "My Businesses" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "earnings", label: "Earnings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface SubscriptionRow {
  slug: string;
  subscriber: string;
  txHash?: string;
  amountUsd: number;
  at: string;
}

export function PortfolioExperience() {
  const { address } = useWallet();
  const [tab, setTab] = useState<TabId>("briefing");

  if (!address) {
    return (
      <ConnectGate
        title="Your portfolio is private."
        sub="Connect your wallet to see your businesses, subscriptions, and earnings."
      />
    );
  }

  return (
    <>
      <Container className="pt-8">
        <div className="flex items-center justify-between gap-4 border-b border-border">
          <div className="flex gap-6 overflow-x-auto scrollbar-hide">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 pb-3 text-[13px] transition-colors",
                  tab === id
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hidden pb-3 font-mono text-[12px] text-subtle sm:block">
            {shortAddress(address)}
          </span>
        </div>
      </Container>

      {tab === "briefing" && <MorningBriefing />}
      {tab === "businesses" && <MyBusinesses address={address} />}
      {tab === "subscriptions" && <MySubscriptions address={address} />}
      {tab === "earnings" && <Earnings address={address} />}
    </>
  );
}

/* ================= my businesses ================= */

function MyBusinesses({ address }: { address: string }) {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);

  useEffect(() => {
    fetch(`/api/agents?owner=${address}`)
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => setAgents([]));
  }, [address]);

  if (agents === null) return <PanelLoading />;

  if (agents.length === 0) {
    return (
      <EmptyState
        title="You haven't launched a business yet."
        sub="Found one in about two minutes. It starts working the moment it deploys — and it never sleeps."
        cta="Launch your first business"
        href="/launch"
      />
    );
  }

  return (
    <Container className="step-enter pt-10 pb-24">
      <h2 className="section-heading">My businesses</h2>
      <p className="mt-1.5 text-[13px] text-muted">
        {agents.length} {agents.length === 1 ? "business" : "businesses"} owned by{" "}
        <span className="font-mono">{shortAddress(address)}</span>
      </p>

      <div className="mt-8 max-w-3xl">
        {agents.map((a, i) => (
          <div
            key={a.slug}
            className={cn(
              "grid items-center gap-x-6 gap-y-2 border-b border-border py-5 sm:grid-cols-[1fr_auto_auto]",
              i === 0 && "border-t"
            )}
          >
            <div className="min-w-0">
              <Link
                href={`/agents/${a.slug}`}
                className="text-[16px] font-medium text-foreground transition-colors hover:text-accent"
              >
                {a.name}
              </Link>
              <p className="mt-0.5 truncate text-[12.5px] text-muted">{a.tagline}</p>
            </div>
            <span className="text-[13px] tabular-nums text-muted">
              {a.pricing.model === "free" ? "Free" : `$${a.pricing.amount}/mo`}
            </span>
            <div className="flex items-center gap-4">
              <CopyEndpoint slug={a.slug} />
              <Link
                href={`/agents/${a.slug}`}
                className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-muted transition-colors hover:bg-accent hover:text-background"
                aria-label={`Open ${a.name}`}
              >
                <ArrowRight className="size-3.5" strokeWidth={2} />
              </Link>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/launch"
        className="mt-8 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-accent"
      >
        Launch another business <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
      </Link>
    </Container>
  );
}

function CopyEndpoint({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(`${window.location.origin}/api/mcp/${slug}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 text-[12px] text-subtle transition-colors hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3.5 text-accent" strokeWidth={2} />
      ) : (
        <Copy className="size-3.5" strokeWidth={1.75} />
      )}
      MCP
    </button>
  );
}

/* ================= subscriptions ================= */

function MySubscriptions({ address }: { address: string }) {
  const [subs, setSubs] = useState<SubscriptionRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/subscriptions?subscriber=${address}`)
      .then((r) => r.json())
      .then((d) => setSubs(d.subscriptions ?? []))
      .catch(() => setSubs([]));
  }, [address]);

  if (subs === null) return <PanelLoading />;

  if (subs.length === 0) {
    return (
      <EmptyState
        title="No subscriptions yet."
        sub="Subscribe to a business and its reports, alerts, and outputs show up here."
        cta="Explore the marketplace"
        href="/marketplace"
      />
    );
  }

  return (
    <Container className="step-enter pt-10 pb-24">
      <h2 className="section-heading">Subscriptions</h2>
      <p className="mt-1.5 text-[13px] text-muted">
        Businesses working for you right now.
      </p>

      <div className="mt-8 max-w-3xl">
        {subs.map((s, i) => (
          <div
            key={`${s.slug}-${s.at}`}
            className={cn(
              "grid items-center gap-x-6 gap-y-1 border-b border-border py-5 sm:grid-cols-[1fr_auto_auto_auto_auto]",
              i === 0 && "border-t"
            )}
          >
            <Link
              href={`/agents/${s.slug}`}
              className="text-[15px] font-medium capitalize text-foreground transition-colors hover:text-accent"
            >
              {s.slug.replace(/-/g, " ")}
            </Link>
            <span className="text-[13px] tabular-nums text-muted">
              {s.amountUsd > 0 ? `$${s.amountUsd}/mo` : "Free"}
            </span>
            <span className="text-[12px] tabular-nums text-subtle">
              since {new Date(s.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            {s.txHash ? (
              <span className="font-mono text-[11px] text-subtle">{s.txHash.slice(0, 10)}…</span>
            ) : (
              <span />
            )}
            <CancelSubscription
              slug={s.slug}
              subscriber={address}
              onCancelled={() => setSubs((prev) => prev?.filter((x) => x !== s) ?? null)}
            />
          </div>
        ))}
      </div>
    </Container>
  );
}

function CancelSubscription({
  slug,
  subscriber,
  onCancelled,
}: {
  slug: string;
  subscriber: string;
  onCancelled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/subscriptions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug, subscriber }),
          });
          if (res.ok) onCancelled();
        } finally {
          setBusy(false);
        }
      }}
      className="justify-self-end text-[12px] text-subtle transition-colors hover:text-negative disabled:opacity-50"
    >
      {busy ? "Cancelling…" : "Cancel"}
    </button>
  );
}

/* ================= earnings ================= */

function Earnings({ address }: { address: string }) {
  const [earnings, setEarnings] = useState<SubscriptionRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/subscriptions?creator=${address}`)
      .then((r) => r.json())
      .then((d) => setEarnings(d.subscriptions ?? []))
      .catch(() => setEarnings([]));
  }, [address]);

  if (earnings === null) return <PanelLoading />;

  const total = earnings.reduce((sum, e) => sum + e.amountUsd, 0);
  const paying = earnings.filter((e) => e.amountUsd > 0);

  if (earnings.length === 0) {
    return (
      <EmptyState
        title="No earnings yet."
        sub="When people subscribe to your businesses, payments land in your wallet and show up here."
        cta="Launch a paid business"
        href="/launch"
      />
    );
  }

  return (
    <Container className="step-enter pt-10 pb-24">
      <h2 className="section-heading">Earnings</h2>
      <p className="mt-1.5 text-[13px] text-muted">
        Paid straight to <span className="font-mono">{shortAddress(address)}</span> — BOWYER
        never holds your money.
      </p>

      <div className="mt-8 flex flex-wrap gap-x-12 gap-y-5 border-y border-border py-6">
        <div>
          <p className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-accent">
            ${total.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">Total earned</p>
        </div>
        <div>
          <p className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
            {earnings.length}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">Subscribers</p>
        </div>
        <div>
          <p className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
            {paying.length}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">Paying</p>
        </div>
      </div>

      <div className="mt-8 max-w-3xl">
        {earnings.map((e, i) => (
          <div
            key={`${e.slug}-${e.at}-${i}`}
            className="grid items-center gap-x-6 border-b border-border py-4 sm:grid-cols-[1fr_auto_auto_auto]"
          >
            <span className="text-[14px] font-medium capitalize text-foreground">
              {e.slug.replace(/-/g, " ")}
            </span>
            <span className="font-mono text-[12px] text-subtle">
              {shortAddress(e.subscriber)}
            </span>
            <span className="text-[12px] tabular-nums text-subtle">
              {new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span
              className={cn(
                "text-right text-[14px] font-medium tabular-nums",
                e.amountUsd > 0 ? "text-accent" : "text-muted"
              )}
            >
              {e.amountUsd > 0 ? `+$${e.amountUsd}` : "Free"}
            </span>
          </div>
        ))}
      </div>
    </Container>
  );
}

/* ================= shared ================= */

function PanelLoading() {
  return (
    <Container className="pt-10 pb-24">
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.03]" />
        ))}
      </div>
    </Container>
  );
}

function EmptyState({
  title,
  sub,
  cta,
  href,
}: {
  title: string;
  sub: string;
  cta: string;
  href: string;
}) {
  return (
    <Container className="step-enter flex min-h-[45vh] max-w-md flex-col items-start justify-center pb-24">
      <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
      <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{sub}</p>
      <Link
        href={href}
        className="mt-7 flex h-11 items-center gap-2 rounded-sm bg-accent px-6 text-[14px] font-medium text-background transition-opacity hover:opacity-90"
      >
        {cta} <ArrowRight className="size-4" strokeWidth={2} />
      </Link>
    </Container>
  );
}
