"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Flame, Sprout, Crown } from "lucide-react";
import type { ScreenerToken } from "@/lib/market-data";
import {
  AgentBadge,
  Pct,
  TokenAvatar,
  fmtAge,
  fmtUsd,
  shortAddr,
  timeAgo,
} from "@/components/terminal/widgets";

interface ScreenerPayload {
  ok: boolean;
  updatedAt: string;
  signal: { level: string; headline: string } | null;
  tokens: ScreenerToken[];
}

const POLL_MS = 30_000;

function LaunchCard({ token }: { token: ScreenerToken }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/terminal/t/${token.address}`)}
      className="card-frame w-full px-3.5 py-3 text-left transition-colors hover:bg-raised/60"
    >
      <div className="flex items-center gap-2.5">
        <TokenAvatar imageUrl={token.imageUrl} symbol={token.symbol} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold">{token.symbol}</span>
            <span className="shrink-0 font-mono-num text-[11px] text-subtle">{fmtAge(token.ageMinutes)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-subtle">{token.name}</span>
            <Pct v={token.change24h} className="shrink-0 text-[11px]" />
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2 text-[10.5px]">
        <span className="font-mono-num text-muted">
          liq {fmtUsd(token.liquidityUsd)} · vol {fmtUsd(token.volume24h)}
        </span>
        <AgentBadge verdict={token.agent} />
      </div>
      <div className="mt-1.5 font-mono-num text-[10px] text-subtle">{shortAddr(token.address)}</div>
    </button>
  );
}

function Column({
  title,
  icon: Icon,
  tone,
  tokens,
  empty,
}: {
  title: string;
  icon: typeof Flame;
  tone: string;
  tokens: ScreenerToken[];
  empty: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className={tone} />
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em]">{title}</h2>
        <span className="ml-auto rounded bg-raised px-1.5 py-0.5 font-mono-num text-[10px] text-subtle">
          {tokens.length}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {tokens.map((token) => (
          <LaunchCard key={token.address} token={token} />
        ))}
        {tokens.length === 0 && (
          <div className="card-frame px-4 py-8 text-center text-[11.5px] text-subtle">{empty}</div>
        )}
      </div>
    </div>
  );
}

export function PulseView() {
  const [data, setData] = useState<ScreenerPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/market/screener", { cache: "no-store" });
      const body = (await res.json()) as ScreenerPayload;
      if (body.ok) setData(body);
    } catch {
      // Poll again on the next tick.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const columns = useMemo(() => {
    const tokens = data?.tokens ?? [];
    const fresh = tokens.filter((t) => t.fresh);
    const justLaunched = fresh.filter((t) => (t.ageMinutes ?? Infinity) <= 90 || t.liquidityUsd === null);
    const heating = fresh.filter(
      (t) => !justLaunched.includes(t) && ((t.volume24h ?? 0) > 500 || (t.liquidityUsd ?? 0) > 2_000)
    );
    const leaders = tokens
      .filter((t) => !t.fresh)
      .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
      .slice(0, 8);
    return { justLaunched, heating, leaders };
  }, [data]);

  return (
    <div className="px-4 py-6 lg:px-8">
      <div className="sun-rays card-frame flex flex-wrap items-center justify-between gap-4 px-5 py-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">The Hood</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
            {data?.signal?.headline ??
              "Live launch tape from Robinhood Chain — every new Uniswap v2/v3 pool, straight from chain logs."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.signal && (
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
                data.signal.level === "hot"
                  ? "border-[#f45d7e]/40 bg-[#f45d7e]/10 text-down"
                  : data.signal.level === "warm"
                    ? "border-[#e8b04b]/40 bg-[#e8b04b]/10 text-gold"
                    : "border-border bg-raised text-muted"
              }`}
            >
              tape: {data.signal.level}
            </span>
          )}
          {data && <span className="text-[11px] text-subtle">updated {timeAgo(data.updatedAt)} ago</span>}
        </div>
      </div>

      {!data ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="animate-pulse text-[13px] text-muted">Reading the launch tape…</div>
        </div>
      ) : (
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          <Column
            title="Just launched"
            icon={Sprout}
            tone="text-up"
            tokens={columns.justLaunched}
            empty="No pools created in the current window. Quiet tape."
          />
          <Column
            title="Heating up"
            icon={Flame}
            tone="text-down"
            tokens={columns.heating}
            empty="Nothing fresh has real volume yet."
          />
          <Column
            title="Chain leaders"
            icon={Crown}
            tone="text-gold"
            tokens={columns.leaders}
            empty="Leaders load once DexScreener responds."
          />
        </div>
      )}

      <p className="mt-6 flex items-center gap-1 text-[11px] text-subtle">
        Launch detection runs on raw pool-creation events — factories and launchpads included.
        Full methodology in the radar reports on
        <a href="/agents/hood-meme-radar" className="inline-flex items-center gap-0.5 text-muted hover:text-foreground">
          Hood Meme Radar <ArrowUpRight size={10} />
        </a>
      </p>
    </div>
  );
}
