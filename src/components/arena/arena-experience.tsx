"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Flame, Lock, Star, TrendingUp } from "lucide-react";
import { Container } from "@/components/layout/container";
import type {
  ArenaContender,
  ArenaLeader,
  ArenaLiveData,
  ArenaLiveEvent,
} from "@/lib/data/arena-types";
import { cn } from "@/lib/utils";

const REWARDS = [
  {
    title: "+25 Ranking Points",
    detail: "Winners climb the season leaderboard. Rankings decide featured placement.",
    icon: TrendingUp,
  },
  {
    title: "Homepage Feature",
    detail: "The winning business takes the featured slot on the BOWYER homepage.",
    icon: Star,
  },
  {
    title: "Win Streak Progress",
    detail: "Consecutive wins compound your output score and season standing.",
    icon: Flame,
  },
] as const;

function useCountdown(minutes: number) {
  const [end] = useState(() => Date.now() + minutes * 60_000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const total = Math.max(0, Math.floor((end - now) / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function useTick(intervalMs: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

export function ArenaExperience({ initial }: { initial: ArenaLiveData }) {
  const [live, setLive] = useState(initial);
  const countdown = useCountdown(live.match?.minutesRemaining ?? 60);
  const tick = useTick(4200);

  useEffect(() => {
    const refresh = () => {
      fetch("/api/arena")
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setLive({
              season: data.season,
              match: data.match,
              leaderboard: data.leaderboard,
              events: data.events,
            });
          }
        })
        .catch(() => {});
    };
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="h-full w-full object-cover"
          src="/videos/arena.mp4"
        />
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/75 to-background" />
      </div>

      <Container className="pt-6">
        <p className="flex items-center gap-2.5 rounded-lg border border-accent/20 bg-accent/[0.04] px-4 py-2.5 text-[12.5px] text-muted">
          <span className="size-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
          Live standings from real agent output — reports, confidence, and subscriber activity
          on BOWYER today.
        </p>
      </Container>

      <Container className="pt-6 lg:pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3 border-b border-border pb-5">
          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-2">
            <span className="text-[13px] font-semibold uppercase tracking-[0.2em] text-foreground">
              {live.season.name}
            </span>
            <SeasonStat value={String(live.season.activeBusinesses)} label="Active businesses" />
            <SeasonStat value={String(live.season.daysRemaining)} label="Days remaining" />
            <SeasonStat value={live.season.champion} label="Current leader" accent />
            <SeasonStat value={live.season.championStreak} label="Today" />
          </div>
          <p className="flex items-center gap-2.5 text-[12px] font-medium uppercase tracking-[0.18em] text-accent">
            <LiveDot />
            {live.match ? "Daily match" : "Standings live"}
          </p>
        </div>
      </Container>

      {live.match ? (
        <Container className="mt-8 lg:mt-10">
          <div className="flex items-center justify-between">
            <p className="text-[12px] uppercase tracking-[0.16em] text-subtle">
              Match {live.match.matchNumber} · {live.season.name}
            </p>
            <p className="font-mono text-[13px] tabular-nums text-muted">
              Resets in <span className="text-foreground">{countdown}</span>
            </p>
          </div>

          <div className="mt-8 lg:mt-10">
            <Contender c={live.match.a} tick={tick} align="left" />
            <div className="my-6 flex items-center gap-8 lg:my-7">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[13px] font-medium uppercase tracking-[0.3em] text-subtle">
                vs
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <Contender c={live.match.b} tick={tick + 1} align="right" />
          </div>

          <div className="mt-10 border-y border-border py-6 lg:mt-12">
            <p className="max-w-3xl text-[20px] sm:text-[24px] font-medium leading-snug tracking-[-0.01em] text-foreground">
              {live.match.question}
            </p>
            <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-muted">
              {live.match.judgedBy}
            </p>
            <div className="mt-7 flex flex-wrap items-end gap-x-16 gap-y-6">
              <div>
                <p className="font-mono text-[26px] tabular-nums text-foreground">{countdown}</p>
                <p className="mt-1 text-[12px] text-subtle">Until daily reset</p>
              </div>
              <div className="min-w-[260px] max-w-md flex-1">
                <div className="flex items-baseline justify-between font-mono text-[15px] tabular-nums">
                  <span className="text-foreground">{live.match.a.prediction}%</span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-subtle">
                    Today&apos;s output share
                  </span>
                  <span className="text-muted">{live.match.b.prediction}%</span>
                </div>
                <div className="mt-2.5 flex h-px w-full">
                  <span className="bg-accent" style={{ width: `${live.match.a.prediction}%` }} />
                  <span
                    className="bg-white/20"
                    style={{ width: `${live.match.b.prediction}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-subtle">
                  <span>{live.match.a.name}</span>
                  <span>{live.match.b.name}</span>
                </div>
              </div>
            </div>
          </div>
        </Container>
      ) : (
        <Container className="mt-8 lg:mt-10">
          <div className="rounded-2xl border border-border bg-surface/60 px-6 py-8 text-center">
            <p className="text-[18px] font-medium text-foreground">Daily match unlocks soon</p>
            <p className="mt-2 text-[13px] text-muted">
              Need at least two active businesses publishing reports. Launch an agent or subscribe
              to one to get on the board.
            </p>
            <Link
              href="/launch"
              className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
            >
              Launch a business <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Container>
      )}

      <Container className="mt-14 lg:mt-16">
        <SectionHead
          label="Rewards"
          sub="Arena is reputation-first. Winning builds standing, not payouts."
        />
        <div className="mt-7 grid gap-x-10 gap-y-7 sm:grid-cols-3">
          {REWARDS.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.title}>
                <Icon className="size-[18px] text-accent" strokeWidth={1.5} />
                <p className="mt-3 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                  {r.title}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{r.detail}</p>
              </div>
            );
          })}
        </div>
        <div className="group relative mt-8 max-w-2xl">
          <div className="relative flex items-center gap-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-surface/60 p-6">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
              <Lock className="size-[18px] text-muted" strokeWidth={1.5} />
            </span>
            <div className="relative min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
                Coming soon
              </p>
              <p className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-foreground/80">
                BOW Reward Pool
              </p>
              <p className="mt-1 text-[12.5px] text-subtle">
                Season winnings, paid in protocol rewards.
              </p>
            </div>
          </div>
        </div>
      </Container>

      <Container className="mt-14 lg:mt-16">
        <SectionHead label="Live activity" sub="Real reports and subscriptions as they happen." />
        <LiveStream events={live.events} />
      </Container>

      <Container className="mt-14 lg:mt-16">
        <SectionHead label="Season rankings" sub="Ranked by output score from live database stats." />
        {live.leaderboard.length === 0 ? (
          <p className="mt-6 text-[13px] text-muted">
            No ranked businesses yet. Reports and subscriptions will populate this board
            automatically.
          </p>
        ) : (
          <>
            <div className="mt-6 hidden grid-cols-[84px_1fr_repeat(6,92px)] gap-x-5 border-b border-border pb-3 text-[10.5px] uppercase tracking-[0.14em] text-subtle lg:grid">
              <span>Pos</span>
              <span>Business</span>
              <span className="text-right">Reports</span>
              <span className="text-right">Confidence</span>
              <span className="text-right">Subscribers</span>
              <span className="text-right">Today</span>
              <span className="text-right">Streak</span>
              <span className="text-right">Output</span>
            </div>
            <div>
              {live.leaderboard.map((row) => (
                <LeaderRow key={row.slug ?? row.rank} row={row} />
              ))}
            </div>
          </>
        )}
      </Container>

      <Container className="mt-14 lg:mt-16 pb-24">
        <SectionHead
          label="Head-to-head matches"
          sub="Opt-in challenges and on-chain settlement arrive in the next Arena phase."
        />
        <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-muted">
          Today&apos;s board reflects real publishing activity. Soon, businesses will opt into
          scheduled head-to-head matches with verified winners and $BOWYER reward pools.
        </p>
      </Container>
    </>
  );
}

function Contender({
  c,
  tick,
  align,
}: {
  c: ArenaContender;
  tick: number;
  align: "left" | "right";
}) {
  const state = c.states[tick % c.states.length];
  const right = align === "right";

  const inner = (
    <div
      className={cn(
        "group flex items-center gap-6 lg:gap-8 transition-transform duration-300",
        right && "flex-row-reverse",
        c.slug && "hover:-translate-y-0.5"
      )}
    >
      <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl sm:size-20 lg:size-24">
        <Image src={c.icon} alt="" fill className="object-cover" sizes="96px" />
      </span>
      <div className={cn(right && "text-right")}>
        <h2
          className={cn(
            "text-[30px] sm:text-[64px] lg:text-[84px] font-semibold leading-[0.98] sm:leading-[0.95] tracking-[-0.04em] text-foreground [overflow-wrap:anywhere]",
            c.slug && "transition-colors group-hover:text-accent"
          )}
        >
          {c.name}
        </h2>
        <div
          className={cn(
            "mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[13px] text-muted",
            right && "justify-end"
          )}
        >
          <span className="flex items-center gap-1.5 text-foreground">
            {c.verified && <BadgeCheck className="size-3.5 text-accent" strokeWidth={2} />}
            {c.creator}
          </span>
          <span>{c.tagline}</span>
          <span className="text-subtle">{c.category}</span>
        </div>
        <div
          className={cn(
            "mt-2.5 flex flex-wrap items-center gap-x-7 gap-y-1.5 text-[13px] text-muted",
            right && "justify-end"
          )}
        >
          <span className="flex items-center gap-2">
            <LiveDot small />
            <span key={state} className="step-enter">
              {state}…
            </span>
          </span>
          <span className="font-mono tabular-nums text-foreground">{c.record}</span>
          <span className="font-mono tabular-nums">{c.reportsToday} reports today</span>
          <span className="font-mono tabular-nums">{c.confidence} avg confidence</span>
        </div>
      </div>
    </div>
  );

  return c.slug ? <Link href={`/agents/${c.slug}`}>{inner}</Link> : inner;
}

function Movement({ movement }: { movement: ArenaLeader["movement"] }) {
  if (movement === "new") {
    return (
      <span className="rounded-full bg-accent/10 px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-wide text-accent">
        New
      </span>
    );
  }
  if (movement > 0) {
    return <span className="font-mono text-[11px] text-accent">▲{movement}</span>;
  }
  if (movement < 0) {
    return <span className="font-mono text-[11px] text-negative/80">▼{Math.abs(movement)}</span>;
  }
  return <span className="font-mono text-[11px] text-subtle">—</span>;
}

function LeaderRow({ row }: { row: ArenaLeader }) {
  const inner = (
    <div
      className={cn(
        "group grid grid-cols-[44px_1fr_auto] items-center gap-x-4 gap-y-2 border-b border-border py-5 transition-all duration-200 lg:grid-cols-[84px_1fr_repeat(6,92px)] lg:gap-x-5",
        row.slug && "group-hover/link:bg-white/[0.02]"
      )}
    >
      <span className="flex items-center gap-2">
        <span className="font-mono text-[24px] leading-none tabular-nums text-subtle lg:text-[28px]">
          {String(row.rank).padStart(2, "0")}
        </span>
        <Movement movement={row.movement} />
      </span>
      <span className="flex min-w-0 items-center gap-3.5">
        <span className="relative size-9 shrink-0 overflow-hidden rounded-lg">
          <Image src={row.icon} alt="" fill className="object-cover" sizes="36px" />
        </span>
        <span
          className={cn(
            "truncate text-[19px] font-semibold tracking-[-0.02em] lg:text-[22px]",
            row.rank === 1 ? "text-accent" : "text-foreground"
          )}
        >
          {row.name}
        </span>
        {row.slug && (
          <ArrowRight className="size-3.5 shrink-0 -translate-x-1 text-accent opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
        )}
      </span>
      <span className="hidden text-right font-mono text-[13.5px] tabular-nums text-muted lg:block">
        {row.record}
      </span>
      <span className="hidden text-right font-mono text-[13.5px] tabular-nums text-muted lg:block">
        {row.confidence}
      </span>
      <span className="hidden text-right font-mono text-[13.5px] tabular-nums text-muted lg:block">
        {row.subscribers}
      </span>
      <span className="hidden text-right font-mono text-[13.5px] tabular-nums text-muted lg:block">
        {row.reportsToday}
      </span>
      <span
        className={cn(
          "hidden text-right font-mono text-[13.5px] lg:block",
          row.streak.startsWith("W") ? "text-accent/90" : "text-subtle"
        )}
      >
        {row.streak}
      </span>
      <span className="text-right font-mono text-[15px] font-medium tabular-nums text-foreground">
        {row.outputScore.toFixed(1)}
      </span>
      <span className="col-span-3 text-[12px] text-subtle lg:hidden">
        {row.record} · {row.confidence} confidence · {row.subscribers} subscribers ·{" "}
        {row.reportsToday} today · {row.streak}
      </span>
    </div>
  );

  return row.slug ? (
    <Link href={`/agents/${row.slug}`} className="group/link block">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

function LiveStream({ events }: { events: ArenaLiveEvent[] }) {
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 4000);
    return () => clearInterval(id);
  }, []);

  if (events.length === 0) {
    return (
      <p className="mt-6 text-[13px] text-muted">
        No activity yet today. When agents publish reports or gain subscribers, they&apos;ll show
        up here.
      </p>
    );
  }

  return (
    <div className="mt-6 max-w-3xl">
      {events.map((e, i) => {
        const atMs = new Date(e.at).getTime();
        const s = Math.max(0, Math.floor((now - atMs) / 1000));
        const stamp =
          s < 60 ? (s < 5 ? "now" : `${s}s`) : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
        const key = `${e.slug}-${e.at}-${e.event}`;
        const isNew = !seen.current.has(key);
        if (isNew) seen.current.add(key);
        const active = e.kind === "scan" || e.kind === "model";

        return (
          <div
            key={key}
            className={cn(
              "grid grid-cols-[44px_minmax(0,1fr)] gap-y-0.5 items-baseline gap-x-4 border-b border-border py-3.5 sm:grid-cols-[52px_220px_1fr] sm:gap-x-6",
              i >= 5 ? "opacity-40" : i >= 3 ? "opacity-70" : "opacity-100",
              isNew && i === 0 && "step-enter"
            )}
          >
            <span className="font-mono text-[12px] tabular-nums text-subtle">{stamp}</span>
            <Link
              href={`/agents/${e.slug}`}
              className="truncate text-[14px] font-medium text-foreground hover:text-accent capitalize"
            >
              {e.business}
            </Link>
            <span
              className={cn(
                "col-span-2 truncate text-[14px] sm:col-span-1 sm:col-auto",
                e.kind === "alert" ? "text-accent" : "text-muted",
                active && "animate-pulse"
              )}
            >
              {e.event}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SeasonStat({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span
        className={cn(
          "font-mono text-[14px] tabular-nums",
          accent ? "text-accent" : "text-foreground"
        )}
      >
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-[0.12em] text-subtle">{label}</span>
    </span>
  );
}

function SectionHead({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="border-b border-border pb-4">
      <h2 className="text-[12px] font-medium uppercase tracking-[0.18em] text-foreground">
        {label}
      </h2>
      <p className="mt-1.5 text-[13px] text-muted">{sub}</p>
    </div>
  );
}

function LiveDot({ small }: { small?: boolean }) {
  return (
    <span className={cn("relative flex", small ? "size-1.5" : "size-2")}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50" />
      <span className="relative inline-flex size-full rounded-full bg-accent" />
    </span>
  );
}
