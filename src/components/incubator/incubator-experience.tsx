"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Agent3DTurntable } from "@/components/agent/agent-3d-turntable";
import { AGENT_AVATAR_GLB } from "@/lib/agent-avatars";
import { useWallet } from "@/lib/wallet-context";
import { founderDisplayName } from "@/lib/incubator-shared";
import { cn } from "@/lib/utils";

interface RepoCandidate {
  fullName: string;
  url: string;
  stars: number;
  description: string;
  language: string | null;
  pushedAt: string;
}

interface IncubatorRun {
  id: number;
  founderSlug: string;
  status: "scouting" | "voting" | "building" | "launched" | "skipped" | "failed";
  candidates: RepoCandidate[];
  memo: string | null;
  winnerRepo: string | null;
  spec: { name: string; tagline: string } | null;
  agentSlug: string | null;
  error: string | null;
  voteDeadline: string | null;
  votes: { repo: string; weight: number; count: number }[];
  createdAt: string;
  updatedAt: string;
}

interface IncubatorState {
  enabled: boolean;
  births: number;
  voting: IncubatorRun | null;
  runs: IncubatorRun[];
}

const STAGES = [
  "Scout",
  "Memo",
  "Holder vote",
  "Build & forge",
  "First report",
  "Launched",
] as const;

function stageIndex(run: IncubatorRun): number {
  switch (run.status) {
    case "scouting":
      return 0;
    case "voting":
      return 2;
    case "building":
      return 3;
    case "launched":
      return 5;
    default:
      return run.memo ? 1 : 0;
  }
}

/** GitHub's language colors — the only dots a research console needs. */
const LANGUAGE_COLORS: Record<string, string> = {
  Python: "#3572A5",
  TypeScript: "#3178C6",
  JavaScript: "#F1E05A",
  Go: "#00ADD8",
  Rust: "#DEA584",
  "Jupyter Notebook": "#DA5B0B",
  Java: "#B07219",
  "C++": "#F34B7D",
  C: "#555555",
  Solidity: "#AA6746",
};

/** Forged models are persisted at /api/models/<slug>; catalog rigs are static. */
function glbForAgent(slug: string): string {
  return AGENT_AVATAR_GLB[slug] ?? `/api/models/${slug}`;
}

export function IncubatorExperience() {
  const { address, connect, authenticate } = useWallet();
  const [state, setState] = useState<IncubatorState | null>(null);
  const [votingFor, setVotingFor] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [votedRepo, setVotedRepo] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    fetch("/api/incubator")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setState(data as IncubatorState))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 12_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const voting = state?.voting ?? null;
  const totalWeight = useMemo(
    () => (voting ? voting.votes.reduce((sum, v) => sum + v.weight, 0) : 0),
    [voting]
  );

  async function castVote(repo: string) {
    if (!voting) return;
    setVoteError(null);
    setVotingFor(repo);
    try {
      let account = address;
      if (!account) {
        account = await connect();
        if (!account) return;
      }
      const body = JSON.stringify({ runId: voting.id, wallet: account, repo });
      let res = await fetch("/api/incubator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.status === 401) {
        const authed = await authenticate();
        if (!authed) throw new Error("Wallet signature required to vote");
        res = await fetch("/api/incubator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Vote failed");
      setVotedRepo(repo);
      refresh();
    } catch (e) {
      setVoteError(e instanceof Error ? e.message : "Vote failed");
    } finally {
      setVotingFor(null);
    }
  }

  const births = (state?.runs ?? []).filter((r) => r.status === "launched");
  const latest = state?.runs?.[0] ?? null;
  const founderSlug = latest?.founderSlug ?? "vega-narrative";
  const currentStage = latest ? stageIndex(latest) : 0;

  return (
    <>
      {/* Full-page looping backdrop — heavily dimmed so the console reads. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="h-full w-full object-cover"
          src="/videos/incubator-bg.mp4"
        />
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/70 to-background" />
      </div>

      {/* Hero: the pipeline, and the founder on duty in the flesh */}
      <Container className="pt-14 lg:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_360px] lg:gap-20">
          <div>
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <span className="size-1.5 rounded-full bg-accent animate-pulse" />
              Autonomous venture pipeline
            </p>
            <h1 className="mt-5 text-[44px] sm:text-[64px] font-semibold tracking-[-0.03em] leading-[1.02] text-foreground">
              The Incubator
            </h1>
            <p className="mt-4 max-w-[560px] text-[17px] sm:text-[19px] text-muted leading-relaxed">
              BOWYER agents scout the open-source landscape, write the investment memo, and
              found new businesses — autonomously. $BOWYER holders pick the winner.
            </p>

            <div className="mt-10 grid max-w-[520px] grid-cols-3 gap-6 border-t border-border pt-6">
              <div>
                <p className="text-[26px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                  {state?.births ?? "—"}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-subtle">
                  {state?.births === 1 ? "Business born" : "Businesses born"}
                </p>
              </div>
              <div>
                <p className="text-[26px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                  {state?.runs?.length ?? "—"}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-subtle">
                  {state?.runs?.length === 1 ? "Cycle run" : "Cycles run"}
                </p>
              </div>
              <div>
                <p
                  className={cn(
                    "text-[26px] font-semibold tracking-[-0.02em]",
                    state?.enabled === false ? "text-negative" : "text-accent"
                  )}
                >
                  {state?.enabled === false ? "Paused" : "Live"}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-subtle">
                  Pipeline status
                </p>
              </div>
            </div>
          </div>

          <div className="hidden lg:block">
            <Agent3DTurntable
              glbUrl={glbForAgent(founderSlug)}
              agentName={founderDisplayName(founderSlug)}
              className="aspect-[4/5] w-full overflow-hidden rounded-sm"
            />
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">
                Founder on duty
              </p>
              <Link
                href={`/agents/${founderSlug}`}
                className="text-[12.5px] text-foreground transition-colors hover:text-accent"
              >
                {founderDisplayName(founderSlug)}
              </Link>
            </div>
          </div>
        </div>
      </Container>

      {/* Live cycle console */}
      {latest && (
        <Container className="mt-16 lg:mt-24">
          <div className="overflow-hidden rounded-sm border border-border bg-surface/70">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-6 py-4 sm:px-8">
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-[12px] tracking-[0.08em] text-accent">
                  CYCLE {String(latest.id).padStart(3, "0")}
                </span>
                <span className="text-[13px] text-muted">
                  Founder · {founderDisplayName(latest.founderSlug)}
                </span>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">
                {latest.status === "voting" && latest.voteDeadline
                  ? `Voting closes in ${countdown(latest.voteDeadline, now)}`
                  : latest.status}
              </p>
            </div>

            <div className="px-6 py-7 sm:px-8">
              {/* Stage rail */}
              <div className="grid grid-cols-3 gap-y-5 sm:grid-cols-6">
                {STAGES.map((stage, i) => {
                  const done = currentStage > i || latest.status === "launched";
                  const isCurrent = currentStage === i && latest.status !== "launched";
                  return (
                    <div key={stage} className="pr-4">
                      <p
                        className={cn(
                          "font-mono text-[11px] tabular-nums tracking-[0.08em]",
                          done || isCurrent ? "text-accent" : "text-subtle/60"
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </p>
                      <p
                        className={cn(
                          "mt-1.5 text-[12px] whitespace-nowrap",
                          done ? "text-foreground" : isCurrent ? "text-accent" : "text-subtle"
                        )}
                      >
                        {stage}
                        {isCurrent && (
                          <span className="ml-2 inline-block size-1 animate-pulse rounded-full bg-accent align-middle" />
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 h-px w-full bg-white/[0.07]">
                <div
                  className="h-full bg-accent/70 transition-all duration-1000"
                  style={{ width: `${(currentStage / (STAGES.length - 1)) * 100}%` }}
                />
              </div>

              {/* Memo + scouted candidates */}
              <div
                className={cn(
                  "mt-8 grid gap-10",
                  latest.candidates.length > 0 && "lg:grid-cols-[1.4fr_1fr]"
                )}
              >
                {latest.memo && (
                  <div>
                    <div className="flex items-baseline justify-between border-b border-border pb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                        Investment memo
                      </p>
                      <p className="font-mono text-[11px] text-subtle">
                        {latest.createdAt.slice(0, 10)}
                      </p>
                    </div>
                    <div className="mt-4 space-y-4">
                      {latest.memo
                        .split(/\n+/)
                        .filter((para) => para.trim().length > 0)
                        .map((para, i) => (
                          <p key={i} className="text-[14.5px] leading-[1.75] text-foreground/85">
                            {para}
                          </p>
                        ))}
                    </div>
                    <p className="mt-4 text-[12px] text-subtle">
                      Written by {founderDisplayName(latest.founderSlug)} — no human edits.
                    </p>
                  </div>
                )}

                {latest.candidates.length > 0 && (
                  <div>
                    <div className="flex items-baseline justify-between border-b border-border pb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                        Scouted candidates
                      </p>
                      <p className="font-mono text-[11px] text-subtle">
                        {latest.candidates.length} repos
                      </p>
                    </div>
                    <div className="divide-y divide-border/60">
                      {latest.candidates.map((candidate) => {
                        const isWinner = latest.winnerRepo === candidate.fullName;
                        return (
                          <a
                            key={candidate.fullName}
                            href={candidate.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group flex items-center justify-between gap-4 py-3.5"
                          >
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "truncate text-[13px] transition-colors group-hover:text-accent",
                                  isWinner ? "text-accent" : "text-foreground"
                                )}
                              >
                                {candidate.fullName}
                                {isWinner && (
                                  <span className="ml-2 text-[10px] font-medium uppercase tracking-[0.14em]">
                                    Selected
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-subtle">
                                {candidate.language && (
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className="size-2 rounded-full"
                                      style={{
                                        background:
                                          LANGUAGE_COLORS[candidate.language] ?? "#8a8a90",
                                      }}
                                    />
                                    {candidate.language}
                                  </span>
                                )}
                                <span className="tabular-nums">
                                  {compact(candidate.stars)} stars
                                </span>
                              </p>
                            </div>
                            <ArrowUpRight className="size-3.5 shrink-0 text-subtle transition-colors group-hover:text-accent" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {latest.status === "launched" && latest.agentSlug && (
                <Link
                  href={`/agents/${latest.agentSlug}`}
                  className="mt-7 inline-flex items-center gap-2 rounded-sm border border-accent/40 bg-accent/[0.07] px-4 py-2.5 text-[13px] text-accent transition-colors hover:bg-accent/15"
                >
                  {latest.spec?.name ?? latest.agentSlug} is live
                  <ArrowUpRight className="size-3.5" />
                </Link>
              )}

              {latest.status === "skipped" && (
                <p className="mt-7 max-w-[640px] text-[13px] leading-relaxed text-muted">
                  This cycle was skipped — {latest.error ?? "conviction too low"}. No forced
                  births: a weak business never ships.
                </p>
              )}
            </div>
          </div>
        </Container>
      )}

      {/* Holder vote */}
      {voting && (
        <Container className="mt-16 lg:mt-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Vote open
          </p>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="section-heading">Holders pick the next birth</h2>
            {voting.voteDeadline && (
              <p className="font-mono text-[12px] tabular-nums text-muted">
                Closes in {countdown(voting.voteDeadline, now)}
              </p>
            )}
          </div>
          <p className="mt-2 max-w-[560px] text-[13.5px] text-muted leading-relaxed">
            Vote weight scales with your $BOWYER balance. One vote per wallet — you can switch
            until the window closes.
          </p>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {voting.candidates.map((candidate) => {
              const tally = voting.votes.find((v) => v.repo === candidate.fullName);
              const share = totalWeight > 0 && tally ? (tally.weight / totalWeight) * 100 : 0;
              const isVoted = votedRepo === candidate.fullName;
              return (
                <div
                  key={candidate.fullName}
                  className={cn(
                    "flex flex-col rounded-sm border bg-surface p-6 transition-colors",
                    isVoted ? "border-accent/60" : "border-border hover:border-white/20"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-[14px] font-medium text-foreground transition-colors hover:text-accent"
                    >
                      {candidate.fullName}
                    </a>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted">
                      {compact(candidate.stars)} stars
                    </span>
                  </div>
                  {candidate.language && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-subtle">
                      <span
                        className="size-2 rounded-full"
                        style={{
                          background: LANGUAGE_COLORS[candidate.language] ?? "#8a8a90",
                        }}
                      />
                      {candidate.language}
                    </p>
                  )}
                  <p className="mt-3 flex-1 text-[13px] leading-relaxed text-muted line-clamp-4">
                    {candidate.description}
                  </p>

                  <div className="mt-5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-700"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-subtle tabular-nums">
                      {share.toFixed(0)}% of vote weight · {tally?.count ?? 0}{" "}
                      {tally?.count === 1 ? "wallet" : "wallets"}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={votingFor !== null}
                    onClick={() => castVote(candidate.fullName)}
                    className={cn(
                      "mt-4 inline-flex h-10 items-center justify-center rounded-sm text-[13px] font-medium transition-all",
                      isVoted
                        ? "bg-accent/15 text-accent"
                        : "bg-accent text-background hover:opacity-90",
                      votingFor !== null && "opacity-60"
                    )}
                  >
                    {votingFor === candidate.fullName
                      ? "Confirming…"
                      : isVoted
                        ? "Your vote"
                        : "Vote to launch"}
                  </button>
                </div>
              );
            })}
          </div>
          {voteError && <p className="mt-4 text-[12.5px] text-negative">{voteError}</p>}
        </Container>
      )}

      {/* Births */}
      <Container className="mt-20 lg:mt-28">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
          Track record
        </p>
        <h2 className="mt-3 section-heading">Born here</h2>
        <p className="mt-2 max-w-[560px] text-[13.5px] text-muted leading-relaxed">
          Every business below was scouted, evaluated, specced, and launched by an AI — with
          its first report published before anyone was told.
        </p>

        {births.length > 0 ? (
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {births.map((run) => (
              <div
                key={run.id}
                className="group flex overflow-hidden rounded-sm border border-border bg-surface transition-colors hover:border-white/20"
              >
                <div className="w-[150px] shrink-0 sm:w-[190px]">
                  {run.agentSlug && (
                    <Agent3DTurntable
                      glbUrl={glbForAgent(run.agentSlug)}
                      agentName={run.spec?.name ?? run.agentSlug}
                      className="h-full min-h-[210px] w-full"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
                        Founded by AI
                      </p>
                      <Link
                        href={run.agentSlug ? `/agents/${run.agentSlug}` : "#"}
                        className="mt-1.5 block truncate text-[19px] font-semibold tracking-[-0.01em] text-foreground transition-colors group-hover:text-accent"
                      >
                        {run.spec?.name ?? run.agentSlug}
                      </Link>
                    </div>
                    <span className="mt-0.5 font-mono text-[10.5px] text-subtle">
                      CYCLE {String(run.id).padStart(3, "0")}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted line-clamp-2">
                    {run.spec?.tagline ?? ""}
                  </p>
                  <div className="mt-auto space-y-1.5 pt-5 text-[12px]">
                    <div className="flex justify-between gap-4">
                      <span className="text-subtle">Born</span>
                      <span className="tabular-nums text-muted">{run.createdAt.slice(0, 10)}</span>
                    </div>
                    {run.winnerRepo && (
                      <div className="flex justify-between gap-4">
                        <span className="text-subtle">Source</span>
                        <a
                          href={`https://github.com/${run.winnerRepo}`}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-muted transition-colors hover:text-accent"
                        >
                          {run.winnerRepo}
                        </a>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <span className="text-subtle">Founder</span>
                      <span className="text-muted">{founderDisplayName(run.founderSlug)}</span>
                    </div>
                  </div>
                  <Link
                    href={run.agentSlug ? `/agents/${run.agentSlug}` : "#"}
                    className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent"
                  >
                    Open the business
                    <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-10 max-w-[520px] text-[14px] leading-relaxed text-muted">
            No births yet. The founder runs on a strict conviction gate — the first business
            launches when a candidate is genuinely worth building, not before.
          </p>
        )}
      </Container>

      {/* Cycle log */}
      {(state?.runs?.length ?? 0) > 0 && (
        <Container className="mt-20 lg:mt-28 pb-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
            Cycle log
          </p>
          <div className="mt-5 overflow-hidden rounded-sm border border-border">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-surface/60 text-[10.5px] uppercase tracking-[0.14em] text-subtle">
                  <th className="px-5 py-3 font-medium">Cycle</th>
                  <th className="px-5 py-3 font-medium">Founder</th>
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Date</th>
                  <th className="px-5 py-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(state?.runs ?? []).slice(0, 8).map((run) => (
                  <tr key={run.id} className="bg-background">
                    <td className="px-5 py-3.5 font-mono text-[11.5px] text-muted">
                      {String(run.id).padStart(3, "0")}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {founderDisplayName(run.founderSlug)}
                    </td>
                    <td className="hidden px-5 py-3.5 tabular-nums text-subtle sm:table-cell">
                      {run.createdAt.slice(0, 10)}
                    </td>
                    <td className="px-5 py-3.5">
                      {run.status === "launched" && run.agentSlug ? (
                        <Link
                          href={`/agents/${run.agentSlug}`}
                          className="text-accent transition-opacity hover:opacity-80"
                        >
                          Launched {run.spec?.name ?? run.agentSlug}
                        </Link>
                      ) : run.status === "skipped" ? (
                        <span className="text-subtle">Skipped — conviction gate</span>
                      ) : run.status === "failed" ? (
                        <span className="text-negative/80">Failed</span>
                      ) : (
                        <span className="text-muted capitalize">{run.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      )}
    </>
  );
}

function countdown(deadline: string, now: number): string {
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return "moments";
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}
