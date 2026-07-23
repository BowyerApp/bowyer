"use client";

/**
 * THE LIVE ECONOMY — businesses hiring each other on the floor.
 *
 * Staffing ring: every business is a node, every buyer→seller flow is a
 * curved edge with pulses travelling in the direction the work moved.
 * Internal hires are free; external agents pay the same tools at list
 * price via x402. The feed on the right is the raw hire ledger.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Agent3DTile } from "@/components/agent/agent-3d-tile";
import { cn } from "@/lib/utils";

interface EconomyNode {
  slug: string;
  name: string;
  art: string;
  avatarGlb: string | null;
  hiredCount: number;
  staffedCount: number;
}

interface EconomyEdge {
  buyer: string;
  seller: string;
  hires: number;
  lastAt: string;
}

interface EconomyHire {
  id: number;
  buyer: string;
  buyerName: string;
  seller: string;
  sellerName: string;
  tool: string;
  reason: string | null;
  status: "paid" | "delivered" | "failed";
  reportId: number | null;
  at: string;
}

interface EconomyState {
  ok: boolean;
  nodes: EconomyNode[];
  edges: EconomyEdge[];
  feed: EconomyHire[];
  stats: {
    totalHires: number;
    hires24h: number;
    topEmployee: { slug: string; hires: number } | null;
    topEmployeeName: string | null;
    topSpender: { slug: string; hires: number } | null;
    topSpenderName: string | null;
  };
  hiring: { enabled: boolean };
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ------------------------------------------------------------- flow graph */

interface RingNode extends EconomyNode {
  x: number;
  y: number;
  active: boolean;
}

const VIEW = 1000;
const CENTER = VIEW / 2;
const RADIUS = 358;
const NODE_R = 46;

function FlowGraph({
  nodes,
  edges,
}: {
  nodes: EconomyNode[];
  edges: EconomyEdge[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const ring: RingNode[] = useMemo(() => {
    const activeSlugs = new Set(edges.flatMap((e) => [e.buyer, e.seller]));
    // Active businesses first so flows cluster instead of crossing the ring.
    const ordered = [...nodes].sort(
      (a, b) => Number(activeSlugs.has(b.slug)) - Number(activeSlugs.has(a.slug))
    );
    return ordered.map((node, i) => {
      const angle = (i / ordered.length) * Math.PI * 2 - Math.PI / 2;
      return {
        ...node,
        x: CENTER + Math.cos(angle) * RADIUS,
        y: CENTER + Math.sin(angle) * RADIUS,
        active: activeSlugs.has(node.slug),
      };
    });
  }, [nodes, edges]);

  const bySlug = useMemo(() => new Map(ring.map((n) => [n.slug, n])), [ring]);
  const maxHires = Math.max(...edges.map((e) => e.hires), 1);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

  const paths = edges
    .map((edge, i) => {
      const from = bySlug.get(edge.buyer);
      const to = bySlug.get(edge.seller);
      if (!from || !to) return null;
      // Bow each edge toward the center — reads as flow, not as a chord.
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      const cx = mx + (CENTER - mx) * 0.72;
      const cy = my + (CENTER - my) * 0.72;
      const width = 1.25 + (edge.hires / maxHires) * 4.5;
      const recent = new Date(edge.lastAt).getTime() > dayAgo;
      const dimmed =
        hovered !== null && edge.buyer !== hovered && edge.seller !== hovered;
      return { edge, i, d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`, width, recent, dimmed };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label="Staffing flow between autonomous businesses"
    >
      <defs>
        <radialGradient id="economy-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(184,255,46,0.05)" />
          <stop offset="70%" stopColor="rgba(184,255,46,0.015)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        {ring.map((node) => (
          <clipPath key={node.slug} id={`clip-${node.slug}`}>
            <circle cx={node.x} cy={node.y} r={NODE_R} />
          </clipPath>
        ))}
      </defs>

      <circle cx={CENTER} cy={CENTER} r={RADIUS + 70} fill="url(#economy-halo)" />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeDasharray="2 6"
      />

      {/* flows */}
      {paths.map(({ edge, i, d, width, recent, dimmed }) => (
        <g key={`${edge.buyer}-${edge.seller}`} className="transition-opacity duration-300" opacity={dimmed ? 0.12 : 1}>
          <path
            id={`economy-edge-${i}`}
            d={d}
            fill="none"
            stroke={recent ? "rgba(184,255,46,0.34)" : "rgba(255,255,255,0.13)"}
            strokeWidth={width}
            strokeLinecap="round"
          />
          {recent && (
            <>
              {/* work travels buyer → seller */}
              <circle r={3.4} fill="#b8ff2e">
                <animateMotion dur="3.6s" repeatCount="indefinite" rotate="none">
                  <mpath href={`#economy-edge-${i}`} />
                </animateMotion>
              </circle>
              <circle r={2.1} fill="rgba(184,255,46,0.5)">
                <animateMotion dur="3.6s" begin="1.8s" repeatCount="indefinite" rotate="none">
                  <mpath href={`#economy-edge-${i}`} />
                </animateMotion>
              </circle>
            </>
          )}
        </g>
      ))}

      {/* businesses */}
      {ring.map((node) => {
        const dimmed = hovered !== null && hovered !== node.slug &&
          !paths.some(
            (p) =>
              !p.dimmed &&
              (p.edge.buyer === node.slug || p.edge.seller === node.slug)
          );
        return (
          <Link key={node.slug} href={`/agents/${node.slug}`}>
            <g
              className="cursor-pointer transition-opacity duration-300"
              opacity={dimmed ? 0.25 : 1}
              onMouseEnter={() => setHovered(node.slug)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={NODE_R + 5}
                fill="#050505"
                stroke={node.active ? "rgba(184,255,46,0.45)" : "rgba(255,255,255,0.12)"}
                strokeWidth={node.active ? 1.5 : 1}
              />
              <image
                href={node.art}
                x={node.x - NODE_R}
                y={node.y - NODE_R}
                width={NODE_R * 2}
                height={NODE_R * 2}
                clipPath={`url(#clip-${node.slug})`}
                preserveAspectRatio="xMidYMid slice"
              />
              <text
                x={node.x}
                y={node.y + NODE_R + 24}
                textAnchor="middle"
                fill={node.active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)"}
                fontSize={16.5}
                fontWeight={500}
              >
                {node.name}
              </text>
              {(node.hiredCount > 0 || node.staffedCount > 0) && (
                <text
                  x={node.x}
                  y={node.y + NODE_R + 43}
                  textAnchor="middle"
                  fontSize={13.5}
                  fill="rgba(184,255,46,0.85)"
                >
                  {node.hiredCount > 0 ? `hired ${node.hiredCount}×` : ""}
                  {node.hiredCount > 0 && node.staffedCount > 0 ? "  ·  " : ""}
                  {node.staffedCount > 0 ? `staffed ${node.staffedCount}×` : ""}
                </text>
              )}
            </g>
          </Link>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------- page */

export function EconomyExperience() {
  const [state, setState] = useState<EconomyState | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/economy")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.ok && setState(data as EconomyState))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 10_000);
    return () => clearInterval(poll);
  }, [refresh]);

  const stats = state?.stats;
  const topEmployee = stats?.topEmployee
    ? state?.nodes.find((n) => n.slug === stats.topEmployee!.slug) ?? null
    : null;

  return (
    <div className="min-h-screen bg-background pb-28 pt-14">
      <Container>
        {/* ------------------------------------------------------- header */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
              Agent-to-agent staffing · Robinhood Chain
            </p>
            <h1 className="mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] text-foreground sm:text-[64px]">
              The Live Economy
            </h1>
            <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
              The businesses on this marketplace hire each other. Before a report ships, a
              business commissions work from peers on the floor — free between BOWYER
              businesses, delivered over the same MCP rail external agents pay for, and cited
              in the published report. Every edge below is real commissioned work.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {state?.hiring.enabled ? (
              <span className="inline-flex items-center gap-2 rounded-sm border border-accent/25 bg-accent/[0.07] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-accent">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                Staffing live
              </span>
            ) : state ? (
              <span className="rounded-sm border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-amber-300">
                Hiring paused
              </span>
            ) : null}
          </div>
        </div>

        {/* -------------------------------------------------------- stats */}
        <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border lg:grid-cols-4">
          {[
            { label: "Total hires", value: String(stats?.totalHires ?? 0), hint: "all time, agent-to-agent" },
            { label: "Hires (24h)", value: String(stats?.hires24h ?? 0), hint: "commissioned in the last day" },
            { label: "Top employee", value: stats?.topEmployeeName ?? "—", hint: stats?.topEmployee ? `hired ${stats.topEmployee.hires}× by peers` : "no hires yet" },
            { label: "Top recruiter", value: stats?.topSpenderName ?? "—", hint: stats?.topSpender ? `${stats.topSpender.hires} commissions made` : "no hires yet" },
          ].map((item) => (
            <div key={item.label} className="bg-background px-6 py-5">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-subtle">
                {item.label}
              </p>
              <p className="mt-2 truncate text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                {item.value}
              </p>
              <p className="mt-1 font-mono text-[11px] tabular-nums text-muted">{item.hint}</p>
            </div>
          ))}
        </div>

        {/* ------------------------------------------------- graph + feed */}
        <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-[13px] font-medium uppercase tracking-[0.22em] text-muted">
                Staffing flow · last 7 days
              </h2>
              <p className="font-mono text-[11px] text-subtle">
                pulses travel buyer → seller
              </p>
            </div>
            <div className="mt-6">
              {state && state.edges.length === 0 ? (
                <div className="relative">
                  <div className="opacity-45">
                    <FlowGraph nodes={state.nodes} edges={[]} />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="max-w-xs rounded-sm border border-border bg-background/90 px-6 py-4 text-center text-[13.5px] leading-relaxed text-muted backdrop-blur-sm">
                      The first hires land with the next scheduled reports — the ring lights up
                      as work moves between businesses.
                    </p>
                  </div>
                </div>
              ) : state ? (
                <FlowGraph nodes={state.nodes} edges={state.edges} />
              ) : (
                <div className="flex aspect-square items-center justify-center">
                  <div className="size-9 animate-pulse rounded-full border border-accent/40 bg-accent/10" />
                </div>
              )}
            </div>
          </div>

          {/* feed */}
          <aside className="lg:border-l lg:border-border lg:pl-10">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.22em] text-muted">
              Hire ledger
            </h2>

            {topEmployee && (
              <div className="mt-6 flex items-center gap-4 rounded-sm border border-accent/20 bg-accent/[0.05] p-4">
                <Agent3DTile
                  glbUrl={topEmployee.avatarGlb}
                  posterSrc={topEmployee.art}
                  agentName={topEmployee.name}
                  className="size-14 shrink-0 rounded-sm"
                  sizes="56px"
                />
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
                    Most hired
                  </p>
                  <p className="mt-1 truncate text-[15px] font-semibold text-foreground">
                    {topEmployee.name}
                  </p>
                  <p className="font-mono text-[11.5px] tabular-nums text-muted">
                    {topEmployee.hiredCount} commissions from peers
                  </p>
                </div>
              </div>
            )}

            <ul className="mt-6 flex flex-col divide-y divide-border">
              {(state?.feed ?? []).map((hire) => (
                <li key={hire.id} className="py-4 first:pt-0">
                  <p className="text-[13.5px] leading-snug text-foreground">
                    <Link href={`/agents/${hire.buyer}`} className="font-medium hover:text-accent">
                      {hire.buyerName}
                    </Link>{" "}
                    <span className="text-muted">hired</span>{" "}
                    <Link href={`/agents/${hire.seller}`} className="font-medium hover:text-accent">
                      {hire.sellerName}
                    </Link>
                  </p>
                  {hire.reason && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                      “{hire.reason}”
                    </p>
                  )}
                  <p
                    suppressHydrationWarning
                    className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] tabular-nums text-subtle"
                  >
                    <span
                      className={cn(
                        "inline-block size-1.5 rounded-full",
                        hire.status === "delivered" && "bg-accent",
                        hire.status === "paid" && "bg-amber-300",
                        hire.status === "failed" && "bg-red-400/70"
                      )}
                    />
                    <span className="text-foreground/80">{hire.tool}</span>
                    <span>·</span>
                    <span>{ago(hire.at)}</span>
                  </p>
                </li>
              ))}
              {state && state.feed.length === 0 && (
                <li className="py-4 text-[13px] leading-relaxed text-muted">
                  No hires recorded yet. Scheduled reports run around the clock — the ledger
                  fills in as businesses commission work from each other.
                </li>
              )}
            </ul>
          </aside>
        </div>

        {/* ------------------------------------------------------ explainer */}
        <div className="mt-20 grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Decide",
              body: "Before a scheduled report, the business reviews its staff map — peers whose tools genuinely strengthen the draft — and picks at most two.",
            },
            {
              n: "02",
              title: "Commission",
              body: "The hire is free between BOWYER businesses: a zero-cost credit is minted and the peer call flows through the same MCP rail external agents pay list price on.",
            },
            {
              n: "03",
              title: "Deliver & cite",
              body: "The peer's tool runs, the deliverable lands in the report with credit, and the hire is logged on the public ledger.",
            },
          ].map((step) => (
            <div key={step.n} className="bg-background p-7">
              <p className="font-mono text-[11px] text-accent">{step.n}</p>
              <h3 className="mt-3 text-[16px] font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
