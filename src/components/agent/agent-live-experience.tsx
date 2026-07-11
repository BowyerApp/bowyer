"use client";

import Link from "next/link";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { Container } from "@/components/layout/container";
import { LiveTerminal } from "@/components/agent/live-terminal";
import { SubscribeButton } from "@/components/agent/subscribe-button";
import { AccessSetup } from "@/components/agent/access-setup";
import type { AgentProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Real, verifiable data for this agent — sourced from the DB and GitHub. */
export interface RealAgentData {
  subscribers: number;
  reportsTotal: number;
  reportsToday: number;
  lastReportAt: string | null;
  reports: {
    id: number;
    title: string;
    body: string;
    confidence: number | null;
    createdAt: string;
  }[];
  github: {
    stars: number;
    forks: number;
    openIssues: number;
    lastPush: string;
  } | null;
}

export function AgentLiveExperience({
  agent,
  real,
}: {
  agent: AgentProfile;
  real: RealAgentData;
}) {
  const isFreeAgent = agent.pricing.model === "free" || agent.pricing.amount <= 0;
  const monthly =
    agent.pricing.model === "subscription" ? `$${agent.pricing.amount}/month` : `$${agent.pricing.amount}`;
  const isFlagship = agent.slug === "whale-hunter";

  const subtitle = isFlagship ? "Institutional flow intelligence" : agent.tagline;

  // Every number here is real: database counts, GitHub stats, or the price.
  const proofMetrics = [
    { value: real.reportsTotal.toLocaleString(), label: "Reports published" },
    { value: real.reportsToday.toLocaleString(), label: "Reports today" },
    { value: real.subscribers.toLocaleString(), label: "Subscribers" },
    ...(real.github
      ? [
          { value: compact(real.github.stars), label: "GitHub stars" },
          { value: compact(real.github.forks), label: "GitHub forks" },
        ]
      : [{ value: isFreeAgent ? "Free" : monthly, label: "Price" }]),
    { value: "4663", label: "Robinhood Chain ID" },
  ].slice(0, 6);

  const knowledge = [
    {
      value: String(agent.dataSources.length),
      label: "Sources",
      detail: agent.dataSources.join(" · "),
    },
    {
      value: String(Math.max(agent.capabilities.length, 1)),
      label: "Capabilities",
      detail: agent.capabilities.slice(0, 3).join(" · ") || agent.tagline,
    },
    {
      value: agent.version,
      label: "Version",
      detail: "Semantic versioning on every release",
    },
    ...(real.github
      ? [
          {
            value: relativeTime(real.github.lastPush),
            label: "Last commit",
            detail: "Live from the GitHub repository",
          },
        ]
      : [
          {
            value: "24/7",
            label: "Availability",
            detail: "Hosted MCP endpoint on BOWYER infrastructure",
          },
        ]),
  ];

  return (
    <>
      {/* ambient background video behind the whole page */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="h-full w-full object-cover"
          src="/videos/agent.mp4"
        />
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/75 to-background" />
      </div>

      {/* 1 · LIVE AGENT */}
      <Container className="pt-10 lg:pt-14">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14 lg:items-stretch min-h-[calc(100vh-14rem)]">
          <div className="flex flex-col justify-center">
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <span className="size-1.5 rounded-full bg-accent" />
              Live MCP endpoint
            </p>

            <h1 className="mt-5 text-[44px] sm:text-[56px] font-semibold tracking-[-0.03em] leading-[1.02] text-foreground">
              {agent.name}
            </h1>
            <p className="mt-3 text-[18px] sm:text-[20px] text-muted tracking-[-0.01em]">
              {subtitle}
            </p>

            <p className="mt-6 max-w-[440px] text-[14px] leading-relaxed text-muted">
              {agent.thesis}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px]">
              <span className="flex items-center gap-1.5 text-foreground">
                <BadgeCheck className="size-4 text-accent" strokeWidth={2} />
                {agent.creator.name}
              </span>
              <span className="text-muted">
                <span className="text-foreground tabular-nums">{real.subscribers}</span>{" "}
                {real.subscribers === 1 ? "subscriber" : "subscribers"}
              </span>
              {real.github && (
                <span className="text-muted">
                  <span className="text-foreground tabular-nums">
                    {compact(real.github.stars)}
                  </span>{" "}
                  GitHub stars
                </span>
              )}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-5">
              <SubscribeButton slug={agent.slug} pricing={agent.pricing} />
              <a
                href="#reports"
                className="text-[13px] text-muted transition-colors hover:text-foreground"
              >
                Read its work ↓
              </a>
            </div>
          </div>

          <LiveTerminal
            slug={agent.slug}
            reportsTotal={real.reportsTotal}
            subscribers={real.subscribers}
            lastReportAt={real.lastReportAt}
          />
        </div>
      </Container>

      {/* 2 · PUBLISHED WORK */}
      <Container className="mt-24 lg:mt-32" id="reports">
        <SectionHeading
          index="01"
          title="Published reports"
          sub="Real output, generated by this agent and stored permanently."
        />

        {real.reports.length > 0 ? (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {real.reports.map((report) => (
              <article
                key={report.id}
                className="group flex flex-col rounded-sm border border-border bg-surface p-7 transition-colors hover:border-white/20 sm:p-8"
              >
                <div className="flex items-center justify-between text-[12px] text-subtle">
                  <span>{formatReportTime(report.createdAt)}</span>
                  {report.confidence !== null && (
                    <span>
                      Confidence{" "}
                      <span className="tabular-nums text-accent">
                        {Math.round(report.confidence * 100)}%
                      </span>
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] leading-snug text-foreground">
                  {report.title}
                </h3>
                <p className="mt-3 flex-1 text-[14px] leading-relaxed text-muted">
                  {report.body.length > 280 ? `${report.body.slice(0, 280)}…` : report.body}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-10 max-w-xl rounded-sm border border-border bg-surface/60 p-8">
            <p className="text-[15px] font-medium text-foreground">No reports published yet.</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Reports are generated on demand through this agent&apos;s MCP endpoint and stored
              here permanently. Subscribe, connect it to your tools, and call{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">
                generate_report
              </code>{" "}
              to publish the first one.
            </p>
            <a
              href="#setup"
              className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-accent transition-opacity hover:opacity-80"
            >
              Set up access <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
            </a>
          </div>
        )}
      </Container>

      {/* 3 · OPERATIONAL PROOF */}
      <Container className="mt-24 lg:mt-32">
        <SectionHeading
          index="02"
          title="Operational proof"
          sub="Live counts from the database and GitHub — nothing invented."
        />

        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-3">
          {proofMetrics.map((m) => (
            <div key={m.label} className="bg-background px-6 py-8">
              <p className="text-[32px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">
                {m.value}
              </p>
              <p className="mt-1.5 text-[12.5px] text-muted">{m.label}</p>
            </div>
          ))}
        </div>
      </Container>

      {/* 4 · KNOWLEDGE */}
      <Container className="mt-24 lg:mt-32">
        <SectionHeading
          index="03"
          title="How it works"
          sub="What powers this business."
        />

        <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {knowledge.map((k) => (
            <div key={k.label}>
              <p className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-accent">
                {k.value}
              </p>
              <p className="mt-1 text-[14px] font-medium text-foreground">{k.label}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{k.detail}</p>
            </div>
          ))}
        </div>

        {agent.howItWorks.length > 0 && (
          <ol className="mt-10 max-w-2xl space-y-3">
            {agent.howItWorks.map((step, i) => (
              <li key={i} className="flex gap-4 text-[13.5px] leading-relaxed text-muted">
                <span className="font-mono text-[12px] text-subtle">{String(i + 1).padStart(2, "0")}</span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </Container>

      {/* 5 · SUBSCRIBE */}
      <Container className="mt-24 lg:mt-32 pb-24" id="subscribe">
        <div className="border-t border-border pt-16 text-center">
          <p className="text-[13px] text-muted">Full access</p>
          <p className="mt-4 text-[52px] sm:text-[64px] font-semibold tracking-[-0.03em] text-foreground">
            {isFreeAgent ? (
              "Free"
            ) : (
              <>
                {monthly.replace("/month", "")}
                <span className="text-[20px] font-normal text-muted">/month</span>
              </>
            )}
          </p>
          <p className="mt-3 text-[14px] text-muted">
            {isFreeAgent
              ? "Open source. Every report and output included."
              : "Every report, on-demand generation, full archive. Cancel anytime."}
          </p>
          <div className="mt-8 flex justify-center">
            <SubscribeButton slug={agent.slug} pricing={agent.pricing} size="lg" />
          </div>
          <p className="mt-6 text-[12px] text-subtle">
            Informational outputs only — not investment advice.{" "}
            <Link href="/docs/setup" className="underline underline-offset-2 hover:text-muted">
              Read the docs
            </Link>
          </p>

          {/* 6 · SET UP ACCESS — what you actually get after subscribing */}
          <AccessSetup
            slug={agent.slug}
            name={agent.name}
            isPaid={!isFreeAgent}
            tools={agent.mcpTools ?? ["generate_report", "get_latest_reports", "ask", "get_status"]}
          />
        </div>
      </Container>
    </>
  );
}

/* ---------- helpers ---------- */

function SectionHeading({ index, title, sub }: { index: string; title: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-5">
      <span className="font-mono text-[12px] text-subtle">{index}</span>
      <div>
        <h2 className="section-heading">{title}</h2>
        <p className="mt-1.5 text-[13px] text-muted">{sub}</p>
      </div>
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatReportTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
