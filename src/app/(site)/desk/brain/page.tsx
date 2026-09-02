import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { DeskRecordsShell } from "@/components/desk/desk-records-shell";
import {
  decisionsFor,
  fillsFor,
  kvGet,
  listActiveAgents,
  pendingFomoTheses,
  thesesFor,
  equitySeries,
  type DecisionRow,
  type FillRow,
} from "@/lib/trading/store";

export const metadata: Metadata = {
  title: "The Brain — HOOD DESK | BOWYER",
  description:
    "Live, unedited reasoning from BOWYER's autonomous trading agents — every decision, every fill, every thesis, with the transaction hash that proves it.",
};

export const dynamic = "force-dynamic";

interface FeedItem extends DecisionRow {
  venue: string;
  wallet: string | null;
}

interface LedgerFill extends FillRow {
  venue: string;
  thesis?: string;
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

function epochOf(sqliteUtc: string): number {
  return new Date(`${sqliteUtc.replace(" ", "T")}Z`).getTime();
}

function walletLink(wallet: string): string {
  return wallet.startsWith("0x")
    ? `https://blockscout.robinhood.com/address/${wallet}`
    : `https://solscan.io/account/${wallet}`;
}

function txLink(venue: string, txHash: string, symbol: string): string | null {
  if (!txHash || txHash === "paper") return null;
  if (txHash.startsWith("hl:")) return `https://app.hyperliquid.xyz/trade/${symbol}`;
  if (venue === "fomo") return `https://solscan.io/tx/${txHash}`;
  return `https://blockscout.robinhood.com/tx/${txHash}`;
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
  const decisions24h = feed.filter((d) => epochOf(d.at) > dayAgo).length;

  // The ledger: every recent fill with its proof, thesis attached by tx hash.
  const ledger: LedgerFill[] = agents
    .flatMap((a) => {
      const venue = a.config?.venue ?? "rhc";
      const thesisByTx = new Map(
        thesesFor(a.id, 60)
          .filter((t) => t.txHash)
          .map((t) => [t.txHash as string, t.thesis])
      );
      return fillsFor(a.id, 30).map((f) => ({
        ...f,
        venue,
        thesis: thesisByTx.get(f.txHash),
      }));
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 20);

  const fills24h = ledger.filter((f) => epochOf(f.at) > dayAgo).length;
  const equityUsd = agents.reduce((sum, a) => {
    const s = equitySeries(a.id, 1);
    return sum + (s.length ? s[s.length - 1].equityUsd : 0);
  }, 0);
  const thesisQueue = pendingFomoTheses(50).length;

  // Honest liveness: newest tick across agents, or say it's stale.
  const lastTickMs = agents
    .map((a) => (a.lastTickAt ? epochOf(a.lastTickAt) : 0))
    .reduce((m, t) => Math.max(m, t), 0);
  const tickAgeMin = lastTickMs ? (Date.now() - lastTickMs) / 60_000 : Infinity;
  const engineLive = tickAgeMin < 5;

  const lastDecisionAt = feed[0]?.at ?? null;
  const lastThesisAt = ledger.find((f) => f.thesis)?.at ?? null;
  const socialLastRun = Number(kvGet("fomo_social_last_run") ?? 0);

  const loops: { name: string; cadence: string; detail: string; proof: string }[] = [
    {
      name: "engine_tick",
      cadence: "60s",
      detail: "prices every position, runs mechanical stops and trails — no model in the loop",
      proof: lastTickMs ? `last tick ${relativeTime(new Date(lastTickMs).toISOString().replace("T", " ").slice(0, 19))}` : "no tick recorded",
    },
    {
      name: "decision_cycle",
      cadence: "3m",
      detail: "reads the tape, social intel and the fomo feed; bull and bear argue; risk officer orders",
      proof: lastDecisionAt ? `last decision ${relativeTime(lastDecisionAt)}` : "no decision recorded",
    },
    {
      name: "thesis_flush",
      cadence: "60s",
      detail: "every fomo fill posts its thesis to the public feed — one per fill, deduplicated by tx",
      proof: lastThesisAt
        ? `last thesis ${relativeTime(lastThesisAt)} · queue ${thesisQueue}`
        : `queue ${thesisQueue}`,
    },
    {
      name: "social_study",
      cadence: "~3h",
      detail: "studies how real fomo traders write, scores and follows the ones worth tracking",
      proof: socialLastRun
        ? `last run ${Math.max(0, Math.round((Date.now() - socialLastRun) / 60_000))}m ago`
        : "not yet run",
    },
  ];

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
              published here before the orders fill. Nothing is curated, and nothing is
              summarised into a number you cannot check.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-4 text-[13px] text-muted">
            <span>
              <span className="block text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                ${equityUsd >= 1000 ? `${(equityUsd / 1000).toFixed(1)}k` : equityUsd.toFixed(0)}
              </span>
              <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-subtle">
                Live equity
              </span>
            </span>
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
                {fills24h}
              </span>
              <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-subtle">
                Fills 24h
              </span>
            </span>
            <span>
              <span
                className={`block text-[22px] font-semibold tracking-[-0.02em] ${engineLive ? "text-emerald-400" : "text-red-400"}`}
              >
                {engineLive ? "live" : "stale"}
              </span>
              <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-subtle">
                {engineLive
                  ? "Engine"
                  : `Engine · ${Math.round(tickAgeMin)}m silent`}
              </span>
            </span>
          </div>
        </div>

        {/* The loops — what runs, how often, and the last proof it ran. */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {loops.map((l, i) => (
            <div key={l.name} className="rounded-sm border border-border bg-surface/40 px-4 py-3.5">
              <p className="font-mono text-[11px] text-subtle">
                PID {i + 1} :: <span className="text-accent">{l.name}</span>
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{l.detail}</p>
              <p className="mt-2.5 font-mono text-[10.5px] text-subtle">
                cadence: {l.cadence} · {l.proof}
              </p>
            </div>
          ))}
        </div>

        {/* The ledger — every fill, every hash. */}
        <div className="mt-14">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Every fill, every hash
          </h2>
          <p className="mt-2 max-w-[600px] text-[13px] text-muted leading-relaxed">
            Each row is an irreversible action taken with real money, and each one carries the
            transaction that proves it. A fill without a proof link is a paper trade, and it says
            so.
          </p>
          <div className="mt-5 divide-y divide-border/60 rounded-sm border border-border bg-background">
            {ledger.length === 0 && (
              <p className="px-5 py-8 text-center text-[13px] text-muted">
                No fills recorded yet.
              </p>
            )}
            {ledger.map((f) => {
              const proof = txLink(f.venue, f.txHash, f.symbol);
              return (
                <div key={f.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span
                      className={`inline-flex w-11 justify-center rounded-sm border px-1 py-0.5 font-mono text-[10.5px] font-bold ${
                        f.side === "buy"
                          ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-400"
                          : "border-red-500/30 bg-red-500/[0.08] text-red-400"
                      }`}
                    >
                      {f.side.toUpperCase()}
                    </span>
                    <span className="font-mono text-[12.5px] font-semibold text-foreground">
                      {f.symbol}
                    </span>
                    <span className="font-mono-num text-[12px] text-muted">
                      ${f.valueUsd.toFixed(2)}
                    </span>
                    <span className="text-[11.5px] text-subtle">{relativeTime(f.at)}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="hidden text-[10.5px] uppercase tracking-[0.1em] text-subtle sm:inline">
                        {VENUE_LABEL[f.venue] ?? f.venue}
                      </span>
                      {proof ? (
                        <a
                          href={proof}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[11px] text-accent transition-opacity hover:opacity-80"
                        >
                          {f.txHash.startsWith("hl:") ? "verify" : `${f.txHash.slice(0, 8)}…`} ↗
                        </a>
                      ) : (
                        <span className="font-mono text-[11px] text-subtle">paper</span>
                      )}
                    </span>
                  </div>
                  {f.thesis && (
                    <p className="mt-2 border-l-2 border-border pl-3 text-[12.5px] leading-relaxed text-muted">
                      {f.thesis}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-[11px] text-subtle">
            the whole ledger is one request away →{" "}
            <a href="/api/desk/ledger" className="text-accent hover:opacity-80">
              /api/desk/ledger
            </a>
          </p>
        </div>

        {/* The decision feed. */}
        <div className="mt-14">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            The decision trail
          </h2>
          <p className="mt-2 max-w-[600px] text-[13px] text-muted leading-relaxed">
            Recorded the moment the model responds, before execution — including the cycles
            where the right move was nothing.
          </p>
        </div>
        <div className="mt-6 space-y-4">
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
          frequency are governed by each agent&apos;s earned risk budget. When a number here is
          stale, the page says so — it will never show you a frozen figure dressed up as a live
          one.
        </p>
      </Container>
    </DeskRecordsShell>
  );
}
