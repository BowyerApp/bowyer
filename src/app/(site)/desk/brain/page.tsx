import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { DeskRecordsShell } from "@/components/desk/desk-records-shell";
import { decisionsFor, listActiveAgents, type DecisionRow } from "@/lib/trading/store";

export const metadata: Metadata = {
  title: "The Brain — HOOD DESK | BOWYER",
  description:
    "Live, unedited reasoning from BOWYER's autonomous trading agents — every decision, every debate, every order, published as it happens.",
};

export const dynamic = "force-dynamic";

interface FeedItem extends DecisionRow {
  venue: string;
  wallet: string | null;
}

const VENUE_LABEL: Record<string, string> = {
  fomo: "FOMO · Solana",
  hyperliquid: "Hyperliquid",
  rhc: "Robinhood Chain",
};

function relativeTime(sqliteUtc: string): string {
  const t = new Date(`${sqliteUtc.replace(" ", "T")}Z`).getTime();
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function walletLink(wallet: string): string {
  return wallet.startsWith("0x")
    ? `https://blockscout.robinhood.com/address/${wallet}`
    : `https://solscan.io/account/${wallet}`;
}

export default function DeskBrainPage() {
  const agents = listActiveAgents().filter((a) => a.mode === "live");
  const feed: FeedItem[] = agents
    .flatMap((a) =>
      decisionsFor(a.id, 15).map((d) => ({
        ...d,
        venue: a.config?.venue ?? "rhc",
        wallet: a.walletAddress,
      }))
    )
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 30);

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const decisions24h = feed.filter(
    (d) => new Date(`${d.at.replace(" ", "T")}Z`).getTime() > dayAgo
  ).length;
  const trades24h = feed
    .filter((d) => new Date(`${d.at.replace(" ", "T")}Z`).getTime() > dayAgo)
    .reduce((n, d) => n + d.orders.length, 0);

  return (
    <DeskRecordsShell active="/desk/brain">
      <Container className="pb-24">
        <div className="mt-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div>
            <h1 className="text-[34px] sm:text-[42px] font-semibold tracking-[-0.03em] leading-[1.05] text-foreground">
              The brain
            </h1>
            <p className="mt-3 max-w-[600px] text-[14.5px] text-muted leading-relaxed">
              Unedited output from the desk&apos;s reasoning model. Every cycle the agents read
              the tape, live X chatter, the fomo thesis feed, and smart-money positioning —
              then a bull and a bear argue, a risk officer decides, and whatever it decides is
              published here before the orders fill. Nothing is curated.
            </p>
          </div>
          <div className="flex gap-10 text-[13px] text-muted">
            <span>
              <span className="block text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                {decisions24h}
              </span>
              <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-subtle">
                Decisions 24h
              </span>
            </span>
            <span>
              <span className="block text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                {trades24h}
              </span>
              <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-subtle">
                Orders 24h
              </span>
            </span>
          </div>
        </div>

        <div className="mt-10 space-y-4">
          {feed.length === 0 && (
            <p className="rounded-sm border border-border bg-surface/40 px-6 py-10 text-center text-[13.5px] text-muted">
              No decisions recorded yet — the desk publishes here the moment an agent thinks.
            </p>
          )}
          {feed.map((d) => (
            <article key={d.id} className="rounded-sm border border-border bg-background">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-6 py-3">
                <span className="inline-flex items-center rounded-sm border border-accent/30 bg-accent/[0.08] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-accent">
                  {VENUE_LABEL[d.venue] ?? d.venue}
                </span>
                <span className="text-[12px] tabular-nums text-subtle">{relativeTime(d.at)}</span>
                {d.orders.length > 0 ? (
                  <span className="flex flex-wrap gap-1.5">
                    {d.orders.map((o, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
                          o.side === "buy"
                            ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-400"
                            : "border-red-500/30 bg-red-500/[0.08] text-red-400"
                        }`}
                      >
                        {o.side.toUpperCase()} {o.symbol}
                        {o.usd ? ` $${Math.round(o.usd)}` : ""}
                        {o.fraction ? ` ${Math.round(o.fraction * 100)}%` : ""}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-sm border border-border bg-surface/60 px-1.5 py-0.5 font-mono text-[11px] text-subtle">
                    NO TRADE
                  </span>
                )}
                {d.wallet && (
                  <a
                    href={walletLink(d.wallet)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto font-mono text-[11px] text-subtle transition-colors hover:text-accent"
                  >
                    verify {d.wallet.slice(0, 4)}…{d.wallet.slice(-4)}
                  </a>
                )}
              </header>

              <div className="px-6 py-4">
                <p className="text-[14px] leading-relaxed text-foreground/90">{d.reasoning}</p>

                {d.debate && d.debate.some((v) => v.view) && (
                  <details className="group mt-4">
                    <summary className="cursor-pointer select-none text-[12px] uppercase tracking-[0.14em] text-subtle transition-colors hover:text-foreground">
                      Desk debate — bull vs bear
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {d.debate
                        .filter((v) => v.view)
                        .map((v) => (
                          <div
                            key={v.role}
                            className="rounded-sm border border-border/60 bg-surface/40 px-4 py-3"
                          >
                            <p
                              className={`text-[10px] font-medium uppercase tracking-[0.14em] ${
                                v.role === "bull" ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {v.role}
                            </p>
                            <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">
                              {v.view}
                            </p>
                          </div>
                        ))}
                    </div>
                  </details>
                )}

                <p className="mt-4 text-[11.5px] leading-relaxed text-subtle">{d.contextNote}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-5 text-[12px] text-subtle">
          Decisions are recorded at the moment the model responds, before execution. Fills are
          verifiable on chain via each agent&apos;s wallet. Position sizes, stops, and trade
          frequency are governed by each agent&apos;s earned risk budget.
        </p>
      </Container>
    </DeskRecordsShell>
  );
}
