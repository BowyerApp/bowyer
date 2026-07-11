"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Flame, Lock, Star, TrendingUp } from "lucide-react";
import { Container } from "@/components/layout/container";
import {
  ARENA_EVENT_POOL,
  ARENA_LEADERBOARD,
  LIVE_MATCH,
  RECENT_MATCHES,
  SEASON,
  UPCOMING_MATCHES,
  type ArenaContender,
  type ArenaEvent,
  type ArenaLeader,
} from "@/lib/data/arena";
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

/* ================= hooks ================= */

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

/* ================= page ================= */

export function ArenaExperience() {
  const countdown = useCountdown(LIVE_MATCH.minutesRemaining);
  const tick = useTick(4200);

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
          src="/videos/arena.mp4"
        />
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/75 to-background" />
      </div>

      {/* ---------- exhibition notice ---------- */}
      <Container className="pt-6">
        <p className="flex items-center gap-2.5 rounded-lg border border-border bg-surface/60 px-4 py-2.5 text-[12.5px] text-muted">
          <span className="size-1.5 shrink-0 rounded-full bg-accent/70" />
          Exhibition preview — this season is simulated to show how Arena works. Live
          competition begins when businesses opt in.
        </p>
      </Container>

      {/* ---------- season strip ---------- */}
      <Container className="pt-6 lg:pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3 border-b border-border pb-5">
          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-2">
            <span className="text-[13px] font-semibold uppercase tracking-[0.2em] text-foreground">
              {SEASON.name}
            </span>
            <SeasonStat value={String(SEASON.activeBusinesses)} label="Active businesses" />
            <SeasonStat value={String(SEASON.daysRemaining)} label="Days remaining" />
            <SeasonStat value={SEASON.champion} label="Current champion" accent />
            <SeasonStat value={SEASON.championStreak} label="Win streak" />
          </div>
          <p className="flex items-center gap-2.5 text-[12px] font-medium uppercase tracking-[0.18em] text-accent">
            <LiveDot />
            Live match
          </p>
        </div>
      </Container>

      {/* ---------- live match ---------- */}
      <Container className="mt-8 lg:mt-10">
        <div className="flex items-center justify-between">
          <p className="text-[12px] uppercase tracking-[0.16em] text-subtle">
            Match 17 · {SEASON.name}
          </p>
          <p className="font-mono text-[13px] tabular-nums text-muted">
            Closes in <span className="text-foreground">{countdown}</span>
          </p>
        </div>

        <div className="mt-8 lg:mt-10">
          <Contender c={LIVE_MATCH.a} tick={tick} align="left" />

          <div className="my-6 flex items-center gap-8 lg:my-7">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[13px] font-medium uppercase tracking-[0.3em] text-subtle">
              vs
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Contender c={LIVE_MATCH.b} tick={tick + 1} align="right" />
        </div>

        <div className="mt-10 border-y border-border py-6 lg:mt-12">
          <p className="max-w-3xl text-[20px] sm:text-[24px] font-medium leading-snug tracking-[-0.01em] text-foreground">
            {LIVE_MATCH.question}
          </p>
          <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-muted">
            {LIVE_MATCH.judgedBy}
          </p>

          <div className="mt-7 flex flex-wrap items-end gap-x-16 gap-y-6">
            <div>
              <p className="font-mono text-[26px] tabular-nums text-foreground">{countdown}</p>
              <p className="mt-1 text-[12px] text-subtle">Until judging</p>
            </div>
            <div className="min-w-[260px] max-w-md flex-1">
              <div className="flex items-baseline justify-between font-mono text-[15px] tabular-nums">
                <span className="text-foreground">{LIVE_MATCH.a.prediction}%</span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-subtle">
                  Community prediction
                </span>
                <span className="text-muted">{LIVE_MATCH.b.prediction}%</span>
              </div>
              <div className="mt-2.5 flex h-px w-full">
                <span className="bg-accent" style={{ width: `${LIVE_MATCH.a.prediction}%` }} />
                <span className="bg-white/20" style={{ width: `${LIVE_MATCH.b.prediction}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-subtle">
                <span>{LIVE_MATCH.a.name}</span>
                <span>{LIVE_MATCH.b.name}</span>
              </div>
            </div>
          </div>
        </div>
      </Container>

      {/* ---------- rewards ---------- */}
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

        {/* locked future reward */}
        <div className="group relative mt-8 max-w-2xl">
          <div
            className="relative flex items-center gap-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-surface/60 p-6 transition-colors duration-300 group-hover:border-white/[0.14]"
            tabIndex={0}
            aria-describedby="bow-pool-tip"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -left-10 top-1/2 size-40 -translate-y-1/2 rounded-full bg-accent/[0.05] blur-3xl transition-opacity duration-300 group-hover:bg-accent/[0.09]"
            />
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
              <Lock
                className="size-[18px] text-muted transition-colors duration-300 group-hover:text-accent"
                strokeWidth={1.5}
              />
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
          <span
            id="bow-pool-tip"
            role="tooltip"
            className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-[#161616] px-3.5 py-2 text-[12px] text-foreground opacity-0 shadow-xl transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Token incentives will launch in a future season.
          </span>
        </div>
      </Container>

      {/* ---------- live activity ---------- */}
      <Container className="mt-14 lg:mt-16">
        <SectionHead label="Live activity" sub="Every event, as it happens." />
        <LiveStream />
      </Container>

      {/* ---------- season rankings ---------- */}
      <Container className="mt-14 lg:mt-16">
        <SectionHead label="Season rankings" sub="Standings update after every match." />

        <div className="mt-6 hidden grid-cols-[84px_1fr_repeat(6,92px)] gap-x-5 border-b border-border pb-3 text-[10.5px] uppercase tracking-[0.14em] text-subtle lg:grid">
          <span>Pos</span>
          <span>Business</span>
          <span className="text-right">Record</span>
          <span className="text-right">Confidence</span>
          <span className="text-right">Subscribers</span>
          <span className="text-right">Today</span>
          <span className="text-right">Streak</span>
          <span className="text-right">Output</span>
        </div>

        <div>
          {ARENA_LEADERBOARD.map((row) => (
            <LeaderRow key={row.rank} row={row} />
          ))}
        </div>
      </Container>

      {/* ---------- recent matches ---------- */}
      <Container className="mt-14 lg:mt-16">
        <SectionHead label="Recent matches" sub="Results are final once settlement is verified." />

        <div className="mt-4 max-w-3xl">
          {RECENT_MATCHES.map((m, i) => (
            <div
              key={`${m.winner}-${m.loser}`}
              className={cn(
                "grid items-baseline gap-x-6 gap-y-1 border-b border-border py-5 sm:grid-cols-[1fr_auto]",
                i === 0 && "border-t"
              )}
            >
              <div className="min-w-0">
                <p className="text-[15px] leading-snug">
                  <span className="font-semibold text-foreground">{m.winner}</span>{" "}
                  <span className="text-accent">defeated</span>{" "}
                  <span className="font-medium text-muted">{m.loser}</span>
                </p>
                <p className="mt-1 text-[12.5px] text-subtle">
                  {m.question} · {m.margin}
                </p>
              </div>
              <span className="text-[12px] tabular-nums text-subtle">{m.when}</span>
            </div>
          ))}
        </div>
      </Container>

      {/* ---------- upcoming matches ---------- */}
      <Container className="mt-14 lg:mt-16 pb-24">
        <SectionHead label="Upcoming matches" sub="The schedule fills as businesses accept challenges." />

        <div className="mt-4 max-w-3xl">
          {UPCOMING_MATCHES.map((m, i) => (
            <div
              key={`${m.a}-${m.b}`}
              className={cn(
                "grid items-baseline gap-x-6 gap-y-1 border-b border-border py-5 sm:grid-cols-[1fr_auto]",
                i === 0 && "border-t"
              )}
            >
              <div className="min-w-0">
                <p className="text-[15px] leading-snug">
                  <span className="font-semibold text-foreground">{m.a}</span>{" "}
                  <span className="text-subtle">vs</span>{" "}
                  <span className="font-semibold text-foreground">{m.b}</span>
                </p>
                <p className="mt-1 text-[12.5px] text-subtle">{m.question}</p>
              </div>
              <span className="font-mono text-[12px] tabular-nums text-accent/80">
                {m.startsIn}
              </span>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}

/* ================= contender ================= */

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
      <span
        className="relative size-16 shrink-0 overflow-hidden rounded-2xl transition-shadow duration-300 sm:size-20 lg:size-24"
        style={{ boxShadow: `0 0 0px 0px ${c.accent}00` }}
      >
        <Image src={c.icon} alt="" fill className="object-cover" sizes="96px" />
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ boxShadow: `inset 0 0 24px 2px ${c.accent}33, 0 0 0 1px ${c.accent}44` }}
        />
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

/* ================= leaderboard row ================= */

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
        <span className="relative size-9 shrink-0 overflow-hidden rounded-lg transition-shadow duration-300 group-hover:shadow-[0_0_16px_rgba(200,255,0,0.25)]">
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
          <ArrowRight
            className="size-3.5 shrink-0 -translate-x-1 text-accent opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
            strokeWidth={2}
          />
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
          row.streak.startsWith("W") ? "text-accent/90" : "text-negative/70"
        )}
      >
        {row.streak}
      </span>
      <span className="text-right font-mono text-[15px] font-medium tabular-nums text-foreground">
        {row.outputScore.toFixed(1)}
      </span>

      {/* mobile detail line */}
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

/* ================= live stream ================= */

interface StreamEntry extends ArenaEvent {
  key: number;
  at: number;
}

function LiveStream() {
  const idx = useRef(5);
  const keyRef = useRef(5);
  const [now, setNow] = useState(() => Date.now());
  const [entries, setEntries] = useState<StreamEntry[]>(() => {
    const start = Date.now();
    return ARENA_EVENT_POOL.slice(0, 5).map((e, i) => ({
      ...e,
      key: i,
      at: start - (i + 1) * 31_000,
    }));
  });

  useEffect(() => {
    const push = setInterval(() => {
      setEntries((prev) => {
        const item = ARENA_EVENT_POOL[idx.current % ARENA_EVENT_POOL.length];
        idx.current += 1;
        keyRef.current += 1;
        return [{ ...item, key: keyRef.current, at: Date.now() }, ...prev].slice(0, 7);
      });
    }, 5200);
    const clock = setInterval(() => setNow(Date.now()), 4000);
    return () => {
      clearInterval(push);
      clearInterval(clock);
    };
  }, []);

  return (
    <div className="mt-6 max-w-3xl">
      {entries.map((e, i) => {
        const s = Math.max(0, Math.floor((now - e.at) / 1000));
        const stamp = s < 5 ? "now" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
        const active = e.kind === "scan" || e.kind === "model";
        return (
          <div
            key={e.key}
            className={cn(
              "step-enter grid grid-cols-[44px_minmax(0,1fr)] gap-y-0.5 items-baseline gap-x-4 border-b border-border py-3.5 transition-opacity duration-500 sm:grid-cols-[52px_220px_1fr] sm:gap-x-6",
              i >= 5 ? "opacity-40" : i >= 3 ? "opacity-70" : "opacity-100"
            )}
          >
            <span className="font-mono text-[12px] tabular-nums text-subtle">{stamp}</span>
            <span className="truncate text-[14px] font-medium text-foreground">{e.business}</span>
            {/* on mobile the event text wraps to a full-width second row */}
            <span
              className={cn(
                "col-span-2 truncate text-[14px] sm:col-span-1 sm:col-auto",
                e.kind === "alert" ? "text-accent" : "text-muted",
                active && "animate-pulse"
              )}
            >
              {e.event}
              {active && "…"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ================= pieces ================= */

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
