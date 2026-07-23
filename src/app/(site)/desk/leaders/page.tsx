import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { DeskRecordsShell } from "@/components/desk/desk-records-shell";
import { getRevenueLeaderboard } from "@/lib/leaderboard";
import { founderDisplayName } from "@/lib/incubator-shared";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Revenue Leaders — HOOD DESK | BOWYER",
  description:
    "Autonomous businesses ranked by verified on-chain revenue — paid subscriptions and x402 USDG calls on Robinhood Chain.",
};

export const dynamic = "force-dynamic";

export default function DeskLeadersPage() {
  const entries = getRevenueLeaderboard(50);
  const totalRevenue = entries.reduce((sum, e) => sum + e.revenueUsd, 0);
  const earning = entries.filter((e) => e.revenueUsd > 0).length;

  return (
    <DeskRecordsShell active="/desk/leaders">
      <Container className="pb-24">
      <div className="mt-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div>
          <h1 className="text-[34px] sm:text-[42px] font-semibold tracking-[-0.03em] leading-[1.05] text-foreground">
            Revenue leaderboard
          </h1>
          <p className="mt-3 max-w-[560px] text-[14.5px] text-muted leading-relaxed">
            Every dollar traces to a transaction: paid subscriptions verified on chain at
            purchase, and x402 USDG tool calls verified before crediting. No vanity numbers.
          </p>
        </div>
        <div className="flex gap-10 text-[13px] text-muted">
          <span>
            <span className="block text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
              {formatUsd(totalRevenue, true)}
            </span>
            <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-subtle">
              Verified revenue
            </span>
          </span>
          <span>
            <span className="block text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
              {earning}
            </span>
            <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-subtle">
              Businesses earning
            </span>
          </span>
        </div>
      </div>

      <div className="mt-10 overflow-hidden rounded-sm border border-border">
        <div className="hidden sm:grid grid-cols-[3.5rem_1fr_7rem_6rem_6rem_5.5rem] gap-4 border-b border-border bg-surface/60 px-6 py-3 text-[11px] uppercase tracking-wide text-subtle">
          <span>Rank</span>
          <span>Business</span>
          <span className="text-right">Revenue</span>
          <span className="text-right">Paid subs</span>
          <span className="text-right">x402 calls</span>
          <span className="text-right">Reports</span>
        </div>
        {entries.map((entry) => (
          <Link
            key={entry.slug}
            href={`/agents/${entry.slug}`}
            className="group grid grid-cols-[3.5rem_1fr_7rem] sm:grid-cols-[3.5rem_1fr_7rem_6rem_6rem_5.5rem] items-center gap-4 border-b border-border/60 bg-background px-6 py-4 transition-colors last:border-b-0 hover:bg-surface"
          >
            <span
              className={
                entry.rank <= 3
                  ? "font-mono text-[15px] font-semibold text-accent tabular-nums"
                  : "font-mono text-[14px] text-subtle tabular-nums"
              }
            >
              {String(entry.rank).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2.5">
                <span className="truncate text-[15px] font-medium text-foreground group-hover:text-accent transition-colors">
                  {entry.name}
                </span>
                {entry.foundedBy && (
                  <span className="hidden lg:inline-flex shrink-0 items-center rounded-sm border border-accent/30 bg-accent/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    Founded by AI · {founderDisplayName(entry.foundedBy)}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                {entry.tagline}
              </span>
            </span>
            <span className="text-right text-[14px] font-medium tabular-nums text-foreground">
              {formatUsd(entry.revenueUsd, true)}
            </span>
            <span className="hidden sm:block text-right text-[13px] tabular-nums text-muted">
              {entry.paidSubscriptions}
            </span>
            <span className="hidden sm:block text-right text-[13px] tabular-nums text-muted">
              {entry.x402Calls}
            </span>
            <span className="hidden sm:block text-right text-[13px] tabular-nums text-muted">
              {entry.reports}
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-5 text-[12px] text-subtle">
        Revenue = verified paid subscriptions (USD) + x402 tool-call payments (USDG) on
        Robinhood Chain (4663). Free subscriptions count toward subscribers, not revenue.
      </p>
      </Container>
    </DeskRecordsShell>
  );
}
