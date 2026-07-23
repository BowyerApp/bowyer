"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Copy } from "lucide-react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ROBINHOOD_TRADING_MCP, buildRobinhoodTradingConnect } from "@/lib/mcp";
import { cn } from "@/lib/utils";

const RobinhoodTradingPanel = dynamic(
  () =>
    import("@/components/trading/robinhood-trading-panel").then(
      (m) => m.RobinhoodTradingPanel
    ),
  {
    ssr: false,
    loading: () => <div className="h-40 animate-pulse rounded-xl bg-white/[0.04]" />,
  }
);

const EASE = [0.22, 1, 0.36, 1] as const;

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const riseIn: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

const QUOTES_REFRESH_MS = 60_000;

interface Quote {
  symbol: string;
  name: string;
  address: string | null;
  underlying: string | null;
  dexPriceUsd: number | null;
  referencePriceUsd: number | null;
  premiumDiscountPct: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  pairUrl: string | null;
}

interface ResearchItem {
  slug: string;
  agentName?: string;
  title: string;
  preview?: string;
  createdAt: string;
  href: string;
}

interface DeskSignal {
  symbol: string;
  premiumPct: number;
  side: "premium" | "discount";
  severity: "watch" | "dislocation";
  trend: "converging" | "widening" | "flat" | "new";
  premiumPct6hAgo: number | null;
  at: string;
}

const TREND_LABEL: Record<DeskSignal["trend"], string> = {
  converging: "gap closing",
  widening: "gap widening",
  flat: "holding",
  new: "new",
};

/** Real business → feed category (the business's actual domain). */
const FEED_CATEGORY: Record<string, string> = {
  "desk-arb-radar": "Arbitrage",
  "atlas-macro": "Macro",
  "whale-hunter": "Flows",
  "robinhood-trading-agent": "Trading",
  "gpt-researcher": "Research",
  "hood-meme-radar": "Radar",
};

function formatLiquidity(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${usd.toFixed(0)}`;
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/* ---------------- price cell with change tint ---------------- */

function FlashCell({
  value,
  className,
  children,
}: {
  value: number | null;
  className?: string;
  children: React.ReactNode;
}) {
  const prev = useRef<number | null>(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before != null && value != null && value !== before) {
      setFlash(value > before ? "up" : "down");
      const t = window.setTimeout(() => setFlash(null), 800);
      return () => window.clearTimeout(t);
    }
  }, [value]);

  return (
    <span
      className={cn(
        "-mx-1.5 rounded px-1.5 py-0.5 transition-colors duration-300",
        flash === "up" && "bg-emerald-400/[0.12]",
        flash === "down" && "bg-rose-400/[0.12]",
        className
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- stock logo ---------------- */

function StockLogo({ symbol }: { symbol: string }) {
  const [failed, setFailed] = useState(false);
  const base = symbol.replace(/x$/i, "").toUpperCase();

  if (failed) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[10.5px] font-semibold text-foreground">
        {base.slice(0, 4)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/images/stocks/${base}.png`}
      alt={`${base} logo`}
      width={32}
      height={32}
      className="size-8 shrink-0 rounded-lg object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/* ---------------- premium history chart ---------------- */

interface PremiumPoint {
  premiumPct: number | null;
  at: string;
}

function PremiumHistoryChart({ symbol }: { symbol: string }) {
  const [history, setHistory] = useState<PremiumPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/desk/signals?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setHistory(d.history ?? []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const points = (history ?? [])
    .filter((p) => p.premiumPct != null)
    .map((p) => ({
      at: p.at,
      premiumPct: Number((p.premiumPct as number).toFixed(3)),
    }));

  if (history === null) {
    return <div className="h-[180px] animate-pulse rounded-lg bg-white/[0.03]" />;
  }

  if (points.length < 2) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-lg border border-white/[0.05] bg-black/20">
        <p className="px-6 text-center text-[12px] text-subtle">
          Building history for {symbol} — the desk records a premium snapshot every few
          minutes while markets move.
        </p>
      </div>
    );
  }

  const last = points[points.length - 1]?.premiumPct ?? 0;
  const stroke = last >= 0 ? "#c8ff00" : "#fb7185";

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`premium-fill-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="at"
            tickFormatter={(v: string) =>
              new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            }
            tick={{ fill: "#5a5d58", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
            tick={{ fill: "#5a5d58", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={52}
            domain={["auto", "auto"]}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{
              background: "#0d0e0c",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
              color: "#f5f5f5",
            }}
            labelFormatter={(v: string) => new Date(v).toLocaleString()}
            formatter={(value: number | string) => [
              `${Number(value) >= 0 ? "+" : ""}${value}%`,
              "vs spot",
            ]}
          />
          <Area
            type="monotone"
            dataKey="premiumPct"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#premium-fill-${symbol})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- status primitives ---------------- */

function StatusDot({ tone = "accent" }: { tone?: "accent" | "muted" }) {
  return (
    <span
      className={cn(
        "size-[5px] shrink-0 rounded-full",
        tone === "accent" ? "bg-accent shadow-[0_0_6px_rgba(200,255,0,0.5)]" : "bg-white/30"
      )}
    />
  );
}

function ModuleHeader({
  title,
  status,
  statusTone = "accent",
}: {
  title: string;
  status: string;
  statusTone?: "accent" | "muted";
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-foreground">
        {title}
      </h2>
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
        <StatusDot tone={statusTone} />
        {status}
      </span>
    </div>
  );
}

/* ---------------- system status telemetry ---------------- */

function SystemStatusRail({
  marketLive,
  publishing,
}: {
  marketLive: boolean;
  publishing: boolean;
}) {
  const items: [string, string, boolean][] = [
    ["Robinhood", "Connected", true],
    ["Market data", marketLive ? "Live" : "Syncing", marketLive],
    ["Research", publishing ? "Publishing" : "Standby", publishing],
    ["Trading", "Ready", true],
  ];
  return (
    <div className="mb-7 flex items-center justify-between gap-6">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-foreground">
        Command center
      </h2>
      <div className="hidden items-center gap-6 md:flex">
        {items.map(([name, state, ok]) => (
          <span key={name} className="flex items-center gap-2 text-[10.5px]">
            <StatusDot tone={ok ? "accent" : "muted"} />
            <span className="uppercase tracking-[0.1em] text-subtle">{name}</span>
            <span className="text-foreground/70">{state}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- connector rail between modules ---------------- */

function ConnectorRail() {
  return (
    <div aria-hidden className="relative hidden lg:block">
      {/* spine */}
      <div className="absolute inset-y-10 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />
      {/* stubs into the modules */}
      <div className="absolute left-0 right-1/2 top-[26%] h-px bg-white/[0.06]" />
      <div className="absolute left-1/2 right-0 top-[26%] h-px bg-white/[0.06]" />
      <div className="absolute left-0 right-1/2 top-[72%] h-px bg-white/[0.06]" />
      <div className="absolute left-1/2 right-0 top-[72%] h-px bg-white/[0.06]" />
      {/* data pulse — one quiet traveller every ~6s */}
      <span className="desk-fx desk-pulse absolute left-1/2 top-10 size-[3px] -translate-x-1/2 rounded-full bg-accent" />
    </div>
  );
}

/* ============================================================ */

export function DeskExperience() {
  const reduced = useReducedMotion();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [signals, setSignals] = useState<DeskSignal[] | null>(null);
  const [research, setResearch] = useState<ResearchItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const cursorSnippet = buildRobinhoodTradingConnect("cursor").command;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await fetch("/api/desk/quotes").then((r) => r.json());
        if (cancelled) return;
        setQuotes(d.quotes ?? []);
        setUpdatedAt(Date.now());
        const s = await fetch("/api/desk/signals").then((r) => r.json());
        if (!cancelled) setSignals(s.signals ?? []);
      } catch {
        if (!cancelled) {
          setQuotes((q) => q ?? []);
          setSignals((s) => s ?? []);
        }
      }
    }
    load();
    const refresh = window.setInterval(load, QUOTES_REFRESH_MS);
    // re-render for the relative "updated Xs ago" label
    const tick = window.setInterval(() => setTick((t) => t + 1), 10_000);

    fetch("/api/desk/research")
      .then((r) => r.json())
      .then((d) => setResearch(d.items ?? []))
      .catch(() => setResearch([]));

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, []);

  function copyMcp() {
    void navigator.clipboard.writeText(ROBINHOOD_TRADING_MCP);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const withData = quotes?.filter((q) => q.premiumDiscountPct != null) ?? [];
  const avgAbsPremium =
    withData.length > 0
      ? withData.reduce((s, q) => s + Math.abs(q.premiumDiscountPct ?? 0), 0) / withData.length
      : null;
  const updatedLabel =
    updatedAt != null ? `Updated ${Math.max(1, Math.round((Date.now() - updatedAt) / 1000))}s ago` : null;

  return (
    <motion.div
      initial={reduced ? undefined : { opacity: 0, y: 7 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="relative overflow-hidden bg-[#070807]"
    >
      {/* page-scoped keyframes for ambient system motion */}
      <style>{`
        @keyframes desk-pulse-travel {
          0%, 84% { opacity: 0; transform: translate(-50%, 0); }
          86% { opacity: 0.9; }
          99% { opacity: 0.9; transform: translate(-50%, min(46vh, 520px)); }
          100% { opacity: 0; transform: translate(-50%, min(46vh, 520px)); }
        }
        .desk-pulse { animation: desk-pulse-travel 6.5s linear infinite; }
        @keyframes desk-scan-travel {
          0% { top: -2%; opacity: 0; }
          4% { opacity: 1; }
          96% { opacity: 1; }
          100% { top: 102%; opacity: 0; }
        }
        .desk-scan { animation: desk-scan-travel 22s linear infinite; }
        @media (prefers-reduced-motion: reduce), (max-width: 1023px) {
          .desk-fx { animation: none !important; opacity: 0 !important; }
        }
      `}</style>

      {/* ============================== hero ============================== */}
      <section className="relative">
        {/* desk footage behind the hero — feathered into the page black */}
        <motion.div
          aria-hidden
          initial={reduced ? undefined : { opacity: 0 }}
          animate={reduced ? undefined : { opacity: 1 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.25 }}
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div
            className="absolute -top-14 right-[-5%] aspect-square w-[min(74vh,720px)] max-lg:left-1/2 max-lg:right-auto max-lg:-translate-x-1/2 max-lg:opacity-30"
            style={{
              maskImage:
                "radial-gradient(68% 68% at 50% 48%, black 42%, transparent 97%)",
              WebkitMaskImage:
                "radial-gradient(68% 68% at 50% 48%, black 42%, transparent 97%)",
            }}
          >
            <video
              src="/videos/desk-hero.mp4"
              poster="/videos/desk-hero-poster.jpg"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className="size-full object-cover brightness-[0.82]"
            />
            {/* smoother left-to-right scrim so the headline always sits on dark */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#070807] via-[#070807]/60 to-[#070807]/10" />
          </div>
          {/* bottom fade — hero dissolves into the product section */}
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-transparent to-[#070807]" />
        </motion.div>

        <div className="relative mx-auto max-w-[1220px] px-6 pt-24 lg:px-10 lg:pt-36">
          <motion.div
            variants={reduced ? undefined : stagger}
            initial={reduced ? undefined : "hidden"}
            animate={reduced ? undefined : "show"}
            className="max-w-[680px]"
          >
            <motion.p
              variants={riseIn}
              className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-subtle"
            >
              <StatusDot />
              HOOD DESK <span className="text-accent">·</span> Robinhood Chain
            </motion.p>

            <h1 className="mt-7 text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[54px] lg:text-[58px]">
              <motion.span variants={riseIn} className="block text-foreground">
                Trade tokenized stocks
              </motion.span>
              <motion.span
                variants={riseIn}
                transition={{ duration: 0.45, ease: EASE, delay: 0.14 }}
                className="block text-accent"
              >
                at the speed of an agent.
              </motion.span>
            </h1>

            <motion.p
              variants={riseIn}
              className="mt-8 max-w-[480px] text-[15px] leading-[1.75] text-muted"
            >
              Live premium and discount for Robinhood Chain Stock Tokens, guardrailed
              execution through Robinhood&apos;s Agentic Trading MCP, and intelligence from
              BOWYER&apos;s autonomous businesses — one connected desk.
            </motion.p>

            <motion.div variants={riseIn} className="mt-11 flex flex-wrap items-center gap-6">
              <a
                href="#board"
                className="group flex h-12 items-center gap-2.5 rounded-[10px] bg-accent px-7 text-[14px] font-semibold text-background transition-transform duration-200 hover:-translate-y-0.5"
              >
                Open the board
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  strokeWidth={2.25}
                />
              </a>
              <Link
                href="/marketplace"
                className="flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-foreground"
              >
                Browse BOWYER research
                <ArrowUpRight className="size-4" strokeWidth={1.75} />
              </Link>
            </motion.div>
          </motion.div>

          {/* system-status rail */}
          <motion.div
            initial={reduced ? undefined : { opacity: 0 }}
            animate={reduced ? undefined : { opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.85 }}
            className="mt-24 border-y border-white/[0.07]"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-14 gap-y-5 py-6 max-lg:gap-x-10">
              <div className="flex flex-wrap items-center gap-x-14 gap-y-5 max-lg:gap-x-10">
                {[
                  ["Stocks tracked", quotes && quotes.length > 0 ? String(quotes.length) : "—"],
                  [
                    "Gap vs spot",
                    avgAbsPremium != null ? `${avgAbsPremium.toFixed(2)}%` : "—",
                  ],
                  ["Settlement", "USDG"],
                  ["Market hours", "24/7"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">
                      {label}
                    </p>
                    <p className="mt-1 text-[17px] font-medium tracking-[-0.01em] text-foreground tabular-nums">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              {/* Desk sub-surfaces: leaderboard, registry, arena. */}
              <div className="flex items-center gap-7">
                {[
                  ["Leaders", "/desk/leaders"],
                  ["Registry", "/desk/registry"],
                  ["Arena", "/desk/arena"],
                ].map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className="group flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-subtle transition-colors hover:text-foreground"
                  >
                    {label}
                    <ArrowUpRight
                      className="size-3 text-subtle transition-colors group-hover:text-accent"
                      strokeWidth={2}
                    />
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ============================== signals ============================== */}
      <section className="mx-auto mt-32 max-w-[1220px] px-6 lg:px-10">
        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 16 }}
          whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-foreground">
              Arbitrage signals
            </h2>
            <span className="text-[10px] uppercase tracking-[0.16em] text-subtle">
              Dislocation ≥ 1% vs spot
            </span>
          </div>

          {signals === null && (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          )}

          {signals !== null && signals.length === 0 && (
            <div className="mt-7 rounded-xl border border-white/[0.06] bg-white/[0.01] px-6 py-9 text-center">
              <p className="text-[13.5px] text-muted">
                No dislocations right now — Stock Tokens are tracking spot.
              </p>
              <p className="mt-1.5 text-[11.5px] text-subtle">
                Signals fire when a token trades ≥1% away from the equity reference.
              </p>
            </div>
          )}

          {signals !== null && signals.length > 0 && (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {signals.slice(0, 6).map((s) => (
                <div
                  key={s.symbol}
                  className={cn(
                    "rounded-xl border p-6 transition-[transform,border-color] duration-200 hover:-translate-y-0.5",
                    s.severity === "dislocation"
                      ? "border-white/[0.10] bg-white/[0.015] hover:border-white/[0.18]"
                      : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.12]"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-semibold text-foreground">{s.symbol}</span>
                    <span
                      className={cn(
                        "text-[9.5px] font-semibold uppercase tracking-[0.16em]",
                        s.severity === "dislocation" ? "text-accent" : "text-subtle"
                      )}
                    >
                      {s.severity}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-4 text-[30px] font-semibold tabular-nums tracking-[-0.02em]",
                      s.premiumPct >= 0 ? "text-accent" : "text-rose-400/90"
                    )}
                  >
                    {s.premiumPct >= 0 ? "+" : ""}
                    {s.premiumPct.toFixed(2)}%
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">
                    Trading at a {s.side} to spot · {TREND_LABEL[s.trend]}
                    {s.premiumPct6hAgo != null && (
                      <span className="text-subtle">
                        {" "}
                        (was {s.premiumPct6hAgo >= 0 ? "+" : ""}
                        {s.premiumPct6hAgo.toFixed(2)}% ~6h ago)
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-[10.5px] text-subtle">{timeAgo(s.at)}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </section>

      {/* ============================== command center ============================== */}
      <section id="board" className="relative mx-auto mt-32 max-w-[1220px] scroll-mt-24 px-6 lg:px-10">
        {/* depth: faint grid + noise + one working glow + scan line */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-2 -inset-y-8 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(80% 80% at 50% 40%, black, transparent)",
            WebkitMaskImage: "radial-gradient(80% 80% at 50% 40%, black, transparent)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 right-[10%] h-[360px] w-[480px] opacity-50"
          style={{
            background: "radial-gradient(50% 50% at 50% 50%, rgba(200,255,0,0.05), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 inset-y-0 overflow-hidden"
        >
          <div className="desk-fx desk-scan absolute inset-x-[6%] h-px bg-gradient-to-r from-transparent via-accent/[0.07] to-transparent" />
        </div>

        <SystemStatusRail
          marketLive={Boolean(quotes && quotes.length > 0)}
          publishing={research.length > 0}
        />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,2fr)_36px_minmax(0,1fr)] lg:gap-0">
          {/* ---------- market board ---------- */}
          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: 18 }}
            whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="self-start overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a0b09] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-7 py-6">
              <div className="flex items-center gap-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-foreground">
                  Market board
                </h2>
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-subtle">
                  <StatusDot tone={quotes && quotes.length > 0 ? "accent" : "muted"} />
                  {updatedLabel ?? "Connecting"}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-[0.16em] text-subtle">
                DEX vs spot
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-[#0a0b09]">
                  <tr className="text-[10px] uppercase tracking-[0.14em] text-subtle shadow-[0_1px_0_rgba(255,255,255,0.05)]">
                    <th className="px-7 py-3.5 font-medium">Token</th>
                    <th className="px-4 py-3.5 text-right font-medium">DEX</th>
                    <th className="px-4 py-3.5 text-right font-medium">Spot</th>
                    <th className="px-4 py-3.5 text-right font-medium">Premium</th>
                    <th className="px-7 py-3.5 text-right font-medium">Liquidity</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes === null &&
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-t border-white/[0.04]">
                        <td colSpan={5} className="px-7 py-[18px]">
                          <div className="h-4 animate-pulse rounded bg-white/[0.05]" />
                        </td>
                      </tr>
                    ))}
                  {quotes?.map((q) => (
                    <Fragment key={q.symbol}>
                    <tr
                      onClick={() =>
                        setExpandedSymbol((s) => (s === q.symbol ? null : q.symbol))
                      }
                      className="group cursor-pointer border-t border-white/[0.04] transition-colors duration-200 hover:bg-white/[0.025]"
                    >
                      <td className="px-7 py-[18px]">
                        <div className="flex items-center gap-3.5">
                          <StockLogo symbol={q.symbol} />
                          <div>
                            <div className="flex items-center gap-1.5 font-medium tracking-[-0.01em] text-foreground">
                              {q.symbol}
                              <ChevronDown
                                className={cn(
                                  "size-3 text-subtle transition-transform duration-200",
                                  expandedSymbol === q.symbol && "rotate-180"
                                )}
                                strokeWidth={2}
                              />
                            </div>
                            <div className="mt-px text-[11px] text-subtle">{q.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-[18px] text-right tabular-nums text-foreground/90">
                        <FlashCell value={q.dexPriceUsd}>
                          {q.dexPriceUsd != null ? `$${q.dexPriceUsd.toFixed(2)}` : "—"}
                        </FlashCell>
                      </td>
                      <td className="px-4 py-[18px] text-right tabular-nums text-muted">
                        <FlashCell value={q.referencePriceUsd}>
                          {q.referencePriceUsd != null
                            ? `$${q.referencePriceUsd.toFixed(2)}`
                            : "—"}
                        </FlashCell>
                      </td>
                      <td className="px-4 py-[18px] text-right">
                        {q.premiumDiscountPct == null ? (
                          <span className="text-subtle">—</span>
                        ) : (
                          <FlashCell
                            value={q.premiumDiscountPct}
                            className={cn(
                              "text-[12.5px] font-medium tabular-nums",
                              q.premiumDiscountPct >= 0
                                ? "text-emerald-400/90"
                                : "text-rose-400/90"
                            )}
                          >
                            {q.premiumDiscountPct >= 0 ? "+" : ""}
                            {q.premiumDiscountPct.toFixed(2)}%
                          </FlashCell>
                        )}
                      </td>
                      <td className="relative px-7 py-[18px] text-right tabular-nums text-muted">
                        <span className="transition-opacity duration-200 group-hover:opacity-0">
                          {q.liquidityUsd != null ? formatLiquidity(q.liquidityUsd) : "—"}
                        </span>
                        {q.pairUrl && (
                          <a
                            href={q.pairUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-y-0 right-7 flex items-center whitespace-nowrap text-[12px] font-medium text-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                          >
                            View pool →
                          </a>
                        )}
                      </td>
                    </tr>
                    {expandedSymbol === q.symbol && (
                      <tr className="border-t border-white/[0.04] bg-black/25">
                        <td colSpan={5} className="px-7 py-5">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">
                              {q.symbol} premium vs spot · 48h
                            </p>
                            {q.underlying && (
                              <p className="text-[10px] uppercase tracking-[0.12em] text-subtle">
                                Underlying {q.underlying}
                              </p>
                            )}
                          </div>
                          <PremiumHistoryChart symbol={q.symbol} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                  {quotes?.length === 0 && (
                    <tr className="border-t border-white/[0.04]">
                      <td colSpan={5} className="px-7 py-14 text-center text-[13px] text-subtle">
                        No pools indexed yet — DexScreener can lag new Stock Token listings.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* ---------- connector rail ---------- */}
          <ConnectorRail />

          {/* ---------- system modules ---------- */}
          <div className="grid gap-8 md:grid-cols-2 lg:flex lg:flex-col lg:gap-8">
            {/* robinhood execution */}
            <motion.div
              initial={reduced ? undefined : { opacity: 0, y: 18 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
              className="relative overflow-hidden rounded-2xl border border-accent/[0.28] bg-[#0a0b09] p-6"
            >
              {/* soft internal glow near the status */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-32 w-40"
                style={{
                  background:
                    "radial-gradient(50% 50% at 50% 50%, rgba(200,255,0,0.08), transparent 70%)",
                }}
              />
              <ModuleHeader title="Robinhood execution" status="Connected" />

              <div className="mt-4 grid grid-cols-2 gap-1.5">
                {["Portfolio", "Quotes", "Positions", "Orders"].map((cap) => (
                  <span
                    key={cap}
                    className="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-foreground/75"
                  >
                    {cap}
                  </span>
                ))}
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={copyMcp}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/50 px-3 py-2.5 text-left font-mono text-[11.5px] text-foreground/80 transition-colors duration-200 hover:border-accent/40"
                >
                  <span className="truncate">{ROBINHOOD_TRADING_MCP}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {copied && <span className="text-[10px] text-accent">Copied</span>}
                    {copied ? (
                      <Check className="size-3.5 text-accent" />
                    ) : (
                      <Copy className="size-3.5 text-subtle" />
                    )}
                  </span>
                </button>
                <pre className="mt-2.5 max-h-32 overflow-auto rounded-lg bg-black/60 p-3 text-[10.5px] leading-relaxed text-muted">
                  {cursorSnippet}
                </pre>
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-muted">
                Execution stays inside the user&apos;s Robinhood agentic account. BOWYER never
                holds funds.
              </p>
              <a
                href="https://robinhood.com/us/en/support/articles/agentic-trading-overview/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
              >
                Agentic trading docs
                <ArrowUpRight className="size-3.5" />
              </a>
            </motion.div>

            {/* bowyer intelligence */}
            <motion.div
              initial={reduced ? undefined : { opacity: 0, y: 18 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.16 }}
              className="rounded-2xl border border-white/[0.09] bg-[#0a0b09] p-6"
            >
              <ModuleHeader
                title="BOWYER intelligence"
                status={research.length > 0 ? "Publishing 24/7" : "Standby"}
                statusTone={research.length > 0 ? "accent" : "muted"}
              />

              <div className="mt-3 divide-y divide-white/[0.05]">
                {research.length === 0 && (
                  <p className="py-3 text-[12.5px] text-subtle">No recent reports yet.</p>
                )}
                {research.slice(0, 5).map((item) => (
                  <Link
                    key={`${item.slug}-${item.title}-${item.createdAt}`}
                    href={item.href}
                    className="group block py-3.5 transition-colors duration-200"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
                        {item.agentName ?? item.slug}
                      </span>
                      <span className="shrink-0 text-[10.5px] text-subtle">
                        {timeAgo(item.createdAt)}
                        {FEED_CATEGORY[item.slug] ? ` · ${FEED_CATEGORY[item.slug]}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-[13px] font-medium text-foreground/90 group-hover:text-foreground">
                      {item.title}
                    </p>
                    {item.preview && (
                      <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted">
                        {item.preview}
                      </p>
                    )}
                    <span className="mt-1.5 inline-block text-[11px] text-subtle opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      Read report →
                    </span>
                  </Link>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============================== guardrails ============================== */}
      <section className="mx-auto mt-36 max-w-[1220px] px-6 pb-4 lg:px-10">
        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 18 }}
          whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: EASE }}
          className="rounded-2xl border border-white/[0.09] bg-white/[0.015] p-6 sm:p-10"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-subtle">
            Your rails
          </p>
          <h2 className="mt-2.5 text-[24px] font-semibold tracking-[-0.02em] text-foreground">
            Guardrailed trading
          </h2>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
            Connect your wallet to set research, paper, and approval modes with hard spend
            limits before any agentic order flow.
          </p>
          <div className="mt-8">
            <RobinhoodTradingPanel />
          </div>
        </motion.div>

        <p className="mt-14 pb-28 text-center text-[12px] text-subtle">
          Market data is informational, not investment advice. BOWYER is not affiliated with
          Robinhood Markets, Inc.
        </p>
      </section>
    </motion.div>
  );
}
