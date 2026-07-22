"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUpRight, Copy, Check, Pencil, X } from "lucide-react";
import { Container } from "@/components/layout/container";
import { ConnectGate } from "@/components/layout/wallet-button";
import { MorningBriefing } from "@/components/portfolio/morning-briefing";
import { ConnectionsPanel } from "@/components/connect/connections-panel";
import { shortAddress, useWallet } from "@/lib/wallet-context";
import { ACTIVE_CHAIN } from "@/lib/chain";
import type { AgentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "briefing", label: "Briefing" },
  { id: "businesses", label: "My Businesses" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "connections", label: "Connections" },
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
  return (
    <Suspense fallback={null}>
      <PortfolioExperienceInner />
    </Suspense>
  );
}

function PortfolioExperienceInner() {
  const { address, authenticate } = useWallet();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("briefing");
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (!address) {
      setSessionReady(false);
      return;
    }
    let cancelled = false;
    authenticate()
      .then((ok) => {
        if (!cancelled) setSessionReady(ok);
      })
      .catch(() => {
        if (!cancelled) setSessionReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, authenticate]);

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    const reason = searchParams.get("reason");
    if (!oauth) return;

    if (oauth.endsWith("_ok")) {
      setTab("connections");
      const provider = oauth.replace("_ok", "");
      const labels: Record<string, string> = {
        github: "GitHub",
        notion: "Notion",
        discord: "Discord",
        x: "X",
      };
      setOauthNotice(
        `${labels[provider] ?? provider} connected. Use Launch to pick sources, or manage here.`
      );
    } else if (oauth === "error") {
      setTab("connections");
      const messages: Record<string, string> = {
        github_not_configured: "GitHub OAuth is not configured on the server.",
        notion_not_configured: "Notion OAuth is not configured on the server.",
        discord_not_configured: "Discord OAuth is not configured on the server.",
        x_not_configured: "X OAuth is not configured on the server.",
        missing_code: "The provider did not return an authorization code.",
        invalid_state: "OAuth session expired. Try connecting again.",
        token_exchange: "Could not exchange authorization code for a token.",
        no_token: "No access token returned.",
        user_fetch: "Could not load your profile from the provider.",
      };
      setOauthNotice(messages[reason ?? ""] ?? "Connection failed. Try again.");
    }

    router.replace("/portfolio", { scroll: false });
  }, [searchParams, router]);

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

      {oauthNotice && (
        <Container className="pt-4">
          <p
            className={cn(
              "rounded-sm border px-4 py-3 text-[13px]",
              oauthNotice.includes("failed") || oauthNotice.includes("not configured")
                ? "border-negative/30 text-negative"
                : "border-accent/30 text-accent"
            )}
          >
            {oauthNotice}
          </p>
        </Container>
      )}

      {tab === "briefing" && <MorningBriefing />}
      {tab === "businesses" && <MyBusinesses address={address} sessionReady={sessionReady} />}
      {tab === "subscriptions" && <MySubscriptions address={address} sessionReady={sessionReady} />}
      {tab === "connections" && <ConnectionsPanel />}
      {tab === "earnings" && <Earnings address={address} sessionReady={sessionReady} />}
    </>
  );
}

/* ================= my businesses ================= */

function MyBusinesses({ address, sessionReady }: { address: string; sessionReady: boolean }) {
  const { authenticate } = useWallet();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionReady) return;
    fetch(`/api/agents?owner=${address}`)
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => setAgents([]));
  }, [address, sessionReady]);

  if (!sessionReady || agents === null) return <PanelLoading />;

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
          <div key={a.slug} className={cn("border-b border-border", i === 0 && "border-t")}>
            <div className="grid items-center gap-x-6 gap-y-2 py-5 sm:grid-cols-[1fr_auto_auto]">
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
                <button
                  type="button"
                  onClick={() => setEditing(editing === a.slug ? null : a.slug)}
                  className={cn(
                    "flex items-center gap-1.5 text-[12px] transition-colors",
                    editing === a.slug ? "text-accent" : "text-subtle hover:text-foreground"
                  )}
                >
                  {editing === a.slug ? (
                    <X className="size-3.5" strokeWidth={1.75} />
                  ) : (
                    <Pencil className="size-3.5" strokeWidth={1.75} />
                  )}
                  Edit
                </button>
                <Link
                  href={`/agents/${a.slug}`}
                  className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-muted transition-colors hover:bg-accent hover:text-background"
                  aria-label={`Open ${a.name}`}
                >
                  <ArrowRight className="size-3.5" strokeWidth={2} />
                </Link>
              </div>
            </div>
            {editing === a.slug && (
              <EditBusinessForm
                agent={a}
                authenticate={authenticate}
                onSaved={(updated) => {
                  setAgents((prev) =>
                    prev?.map((x) => (x.slug === updated.slug ? updated : x)) ?? null
                  );
                  setEditing(null);
                }}
              />
            )}
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

function EditBusinessForm({
  agent,
  authenticate,
  onSaved,
}: {
  agent: AgentSummary;
  authenticate: () => Promise<boolean>;
  onSaved: (updated: AgentSummary) => void;
}) {
  const [name, setName] = useState(agent.name);
  const [tagline, setTagline] = useState(agent.tagline);
  const [price, setPrice] = useState(String(agent.pricing.amount ?? 0));
  const [payout, setPayout] = useState("");
  const [interval, setInterval_] = useState("");
  const [savedInterval, setSavedInterval] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/agents/${agent.slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.intervalHours === "number") {
          setSavedInterval(d.intervalHours);
          setInterval_(String(d.intervalHours));
        }
      })
      .catch(() => {});
  }, [agent.slug]);

  const save = async () => {
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    if (name.trim() && name.trim() !== agent.name) payload.name = name.trim();
    if (tagline.trim() && tagline.trim() !== agent.tagline) payload.tagline = tagline.trim();
    const priceNum = Number(price);
    if (Number.isFinite(priceNum) && priceNum !== agent.pricing.amount) payload.priceUsd = priceNum;
    if (payout.trim()) payload.payoutAddress = payout.trim();
    const intervalNum = Number(interval);
    if (interval.trim() && Number.isFinite(intervalNum) && intervalNum !== savedInterval) {
      payload.intervalHours = intervalNum;
    }
    if (Object.keys(payload).length === 0) {
      setBusy(false);
      setError("Nothing changed.");
      return;
    }
    try {
      const send = () =>
        fetch(`/api/agents/${agent.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      let res = await send();
      if (res.status === 401 || res.status === 403) {
        if (await authenticate()) res = await send();
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Update failed. Try again.");
        return;
      }
      onSaved(data.agent as AgentSummary);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "h-10 w-full rounded-sm border border-border bg-white/[0.03] px-3 text-[13px] text-foreground outline-none transition-colors focus:border-accent/50";

  return (
    <div className="mb-5 rounded-sm border border-border bg-white/[0.02] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-subtle">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-subtle">Price (USD / month, 0 = free)</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-subtle">Publish every (hours, 2–168)</span>
          <input
            value={interval}
            onChange={(e) => setInterval_(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder={savedInterval === null ? "Loading…" : undefined}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-subtle">Tagline</span>
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={140} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-wide text-subtle">Payout address (leave blank to keep current)</span>
          <input
            value={payout}
            onChange={(e) => setPayout(e.target.value.trim())}
            placeholder="0x…"
            className={cn(inputClass, "font-mono")}
          />
        </label>
      </div>
      {error && <p className="mt-3 text-[12.5px] text-negative">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="flex h-9 items-center rounded-sm bg-accent px-5 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        <p className="text-[11.5px] text-subtle">
          Your MCP endpoint and existing subscribers are unaffected by edits.
        </p>
      </div>
    </div>
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

function MySubscriptions({ address, sessionReady }: { address: string; sessionReady: boolean }) {
  const { authenticate } = useWallet();
  const [subs, setSubs] = useState<SubscriptionRow[] | null>(null);

  useEffect(() => {
    if (!sessionReady) return;
    fetch(`/api/subscriptions?subscriber=${address}`)
      .then((r) => r.json())
      .then((d) => setSubs(d.subscriptions ?? []))
      .catch(() => setSubs([]));
  }, [address, sessionReady]);

  if (!sessionReady || subs === null) return <PanelLoading />;

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
              <a
                href={`${ACTIVE_CHAIN.blockExplorerUrls[0]}/tx/${s.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-subtle transition-colors hover:text-accent"
                title="View transaction on the explorer"
              >
                {s.txHash.slice(0, 10)}…
              </a>
            ) : (
              <span />
            )}
            <CancelSubscription
              slug={s.slug}
              subscriber={address}
              authenticate={authenticate}
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
  authenticate,
  onCancelled,
}: {
  slug: string;
  subscriber: string;
  authenticate: () => Promise<boolean>;
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
          let res = await fetch("/api/subscriptions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug, subscriber }),
          });
          if (res.status === 401 && (await authenticate())) {
            res = await fetch("/api/subscriptions", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug, subscriber }),
            });
          }
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

interface CreatorDash {
  totalSubscriptionUsd: number;
  totalX402Usdg: number;
  totalSubscribers: number;
  businesses: {
    slug: string;
    name: string;
    subscribers: number;
    payingSubscribers: number;
    subscriptionRevenueUsd: number;
    x402RevenueUsdg: number;
    reports: number;
    paidOnChain: boolean;
    registryPage: string | null;
    mcpUrl: string | null;
  }[];
  recentPayments: {
    kind: "subscription" | "x402";
    slug: string;
    from: string;
    amount: number;
    currency: "USD" | "USDG";
    txHash?: string;
    at: string;
    tool?: string;
  }[];
}

function Earnings({ address, sessionReady }: { address: string; sessionReady: boolean }) {
  const [dash, setDash] = useState<CreatorDash | null>(null);

  useEffect(() => {
    if (!sessionReady) return;
    fetch("/api/creator/dashboard")
      .then((r) => r.json())
      .then((d) => setDash(d.dashboard ?? null))
      .catch(() => setDash(null));
  }, [address, sessionReady]);

  if (!sessionReady || dash === null) return <PanelLoading />;

  if (dash.businesses.length === 0 && dash.recentPayments.length === 0) {
    return (
      <EmptyState
        title="No earnings yet."
        sub="When people subscribe or pay per call in USDG, payments land in your wallet and show up here with on-chain proof."
        cta="Launch a paid business"
        href="/launch"
      />
    );
  }

  return (
    <Container className="step-enter pt-10 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="section-heading">Earnings & trust</h2>
          <p className="mt-1.5 text-[13px] text-muted">
            Paid straight to <span className="font-mono">{shortAddress(address)}</span> — BOWYER
            never holds your money.
          </p>
        </div>
        <a
          href="/api/creator/dashboard?format=csv"
          className="text-[13px] text-muted transition-colors hover:text-foreground"
        >
          Export CSV
        </a>
      </div>

      <div className="mt-8 flex flex-wrap gap-x-12 gap-y-5 border-y border-border py-6">
        <div>
          <p className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-accent">
            ${dash.totalSubscriptionUsd.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">Subscription revenue</p>
        </div>
        <div>
          <p className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
            {dash.totalX402Usdg.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDG
          </p>
          <p className="mt-0.5 text-[12px] text-muted">Pay-per-call (x402)</p>
        </div>
        <div>
          <p className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
            {dash.totalSubscribers}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">Subscribers</p>
        </div>
      </div>

      <h3 className="mt-10 text-[15px] font-medium text-foreground">Your businesses</h3>
      <div className="mt-4 max-w-3xl divide-y divide-border border-y border-border">
        {dash.businesses.map((b) => (
          <div key={b.slug} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/agents/${b.slug}`}
                  className="text-[14px] font-medium text-foreground hover:text-accent"
                >
                  {b.name}
                </Link>
                {b.paidOnChain && (
                  <span className="rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                    Paid on-chain
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12px] text-muted">
                {b.subscribers} subs · {b.reports} reports · $
                {b.subscriptionRevenueUsd.toLocaleString()} + {b.x402RevenueUsdg.toFixed(2)} USDG
              </p>
            </div>
            <div className="flex gap-3 text-[12px]">
              {b.registryPage && (
                <a href={`/api/registry/${b.slug}`} className="text-muted hover:text-foreground">
                  Registry
                </a>
              )}
              {b.mcpUrl && (
                <a href={b.mcpUrl} className="text-muted hover:text-foreground">
                  MCP
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-10 text-[15px] font-medium text-foreground">Recent payments</h3>
      <div className="mt-4 max-w-3xl">
        {dash.recentPayments.map((e, i) => (
          <div
            key={`${e.slug}-${e.at}-${i}`}
            className="grid items-center gap-x-6 border-b border-border py-4 sm:grid-cols-[1fr_auto_auto_auto_auto_auto]"
          >
            <span className="text-[14px] font-medium capitalize text-foreground">
              {e.slug.replace(/-/g, " ")}
              {e.tool ? (
                <span className="ml-2 text-[11px] font-normal text-subtle">{e.tool}</span>
              ) : null}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-subtle">{e.kind}</span>
            <span className="font-mono text-[12px] text-subtle">{shortAddress(e.from)}</span>
            <span className="text-[12px] tabular-nums text-subtle">
              {new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            {e.txHash ? (
              <a
                href={`${ACTIVE_CHAIN.blockExplorerUrls[0]}/tx/${e.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-accent"
                title={e.txHash}
              >
                Receipt
                <ArrowUpRight className="size-3" strokeWidth={1.75} />
              </a>
            ) : (
              <span className="text-[12px] text-subtle/60">—</span>
            )}
            <span
              className={cn(
                "text-right text-[14px] font-medium tabular-nums",
                e.amount > 0 ? "text-accent" : "text-muted"
              )}
            >
              {e.amount > 0
                ? e.currency === "USDG"
                  ? `+${e.amount} USDG`
                  : `+$${e.amount}`
                : "Free"}
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
