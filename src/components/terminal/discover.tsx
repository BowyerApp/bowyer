"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import type { ScreenerToken } from "@/lib/market-data";
import {
  AgentBadge,
  Pct,
  RiskChip,
  Sparkline,
  StatBlock,
  TokenAvatar,
  fmtAge,
  fmtNum,
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

type SortKey = "volume24h" | "liquidityUsd" | "mcap" | "change24h" | "ageMinutes";
type Tab = "all" | "fresh" | "passed";

const POLL_MS = 30_000;

export function DiscoverView({
  mode,
  initialData,
}: {
  mode: "meme" | "equity";
  initialData?: ScreenerPayload | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<ScreenerPayload | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
  const [sortDesc, setSortDesc] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const prevPrices = useRef<Map<string, number>>(new Map());
  const [ticks, setTicks] = useState<Map<string, "up" | "down">>(new Map());

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/market/screener${mode === "equity" ? "?view=equities" : ""}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as ScreenerPayload;
      if (!body.ok) throw new Error("Screener unavailable");
      const nextTicks = new Map<string, "up" | "down">();
      for (const token of body.tokens) {
        const prev = prevPrices.current.get(token.address);
        if (prev && token.priceUsd && token.priceUsd !== prev) {
          nextTicks.set(token.address, token.priceUsd > prev ? "up" : "down");
        }
        if (token.priceUsd) prevPrices.current.set(token.address, token.priceUsd);
      }
      setTicks(nextTicks);
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setRefreshing(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const rows = useMemo(() => {
    let list = data?.tokens ?? [];
    if (tab === "fresh") list = list.filter((t) => t.fresh);
    if (tab === "passed") list = list.filter((t) => t.agent === "passed");
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.includes(q)
      );
    }
    const dir = sortDesc ? -1 : 1;
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? (sortKey === "ageMinutes" ? Number.MAX_SAFE_INTEGER : -1);
      const bv = b[sortKey] ?? (sortKey === "ageMinutes" ? Number.MAX_SAFE_INTEGER : -1);
      return (av - bv) * dir;
    });
  }, [data, tab, query, sortKey, sortDesc]);

  const totals = useMemo(() => {
    const tokens = data?.tokens ?? [];
    return {
      count: tokens.length,
      fresh: tokens.filter((t) => t.fresh).length,
      volume: tokens.reduce((sum, t) => sum + (t.volume24h ?? 0), 0),
      liquidity: tokens.reduce((sum, t) => sum + (t.liquidityUsd ?? 0), 0),
    };
  }, [data]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDesc ? " ↓" : " ↑") : "");

  const isEquity = mode === "equity";

  return (
    <div className="px-4 py-6 lg:px-8">
      {/* hero */}
      <div className="sun-rays card-frame relative overflow-hidden px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isEquity ? "Tokenized equities" : "Discover"}
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
              {isEquity
                ? "Robinhood Chain stock tokens with on-chain pool prices. The change column shows premium or discount versus the reference price."
                : data?.signal
                  ? data.signal.headline
                  : "Scanning Uniswap v2/v3 pool creations on Robinhood Chain…"}
            </p>
          </div>
          {!isEquity && data?.signal ? (
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
          ) : null}
        </div>
      </div>

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBlock label="Tracked" value={totals.count} />
        {!isEquity && <StatBlock label="Fresh launches" value={totals.fresh} tone={totals.fresh > 0 ? "up" : undefined} />}
        <StatBlock label="24h volume" value={fmtUsd(totals.volume)} />
        <StatBlock label="Liquidity" value={fmtUsd(totals.liquidity)} />
      </div>

      {/* controls */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!isEquity && (
          <div className="flex rounded-md border border-border bg-raised p-0.5">
            {(["all", "fresh", "passed"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                  tab === t ? "bg-ink text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {t === "passed" ? "Agent passed" : t}
              </button>
            ))}
          </div>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, symbol, address"
          spellCheck={false}
          className="w-56 rounded-md border border-border bg-raised px-3 py-1.5 text-[12px] placeholder:text-subtle focus:border-accent/40 focus:outline-none"
        />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-subtle">
          {data ? <span>updated {timeAgo(data.updatedAt)} ago</span> : null}
          <button
            onClick={load}
            className="flex items-center gap-1 rounded-md border border-border bg-raised px-2 py-1 text-muted transition-colors hover:text-foreground"
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} /> refresh
          </button>
        </div>
      </div>

      {/* mobile cards */}
      <div className="mt-3 space-y-2 md:hidden">
        {!data && !error && (
          <div className="card-frame px-4 py-14 text-center text-[13px] text-muted">
            <div className="animate-pulse">Scanning Robinhood Chain…</div>
            <div className="mt-1 text-[11px] text-subtle">First scan takes up to 20 seconds.</div>
          </div>
        )}
        {error && !data && (
          <div className="card-frame px-4 py-14 text-center text-[13px] text-down">
            {error} — retrying automatically.
          </div>
        )}
        {data && rows.length === 0 && (
          <div className="card-frame px-4 py-14 text-center text-[13px] text-muted">
            Nothing matches this filter right now.
          </div>
        )}
        {rows.map((token) => {
          const clickable = token.address.startsWith("0x");
          return (
            <div
              key={token.address}
              onClick={() => clickable && router.push(`/terminal/t/${token.address}`)}
              className={`card-frame flex items-center gap-3 px-3 py-3 ${clickable ? "cursor-pointer active:bg-raised/60" : ""}`}
            >
              <TokenAvatar imageUrl={token.imageUrl} symbol={token.symbol} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold">{token.symbol}</span>
                  {token.fresh && (
                    <span className="rounded border border-accent/40 bg-accent/10 px-1 py-px text-[9px] font-bold uppercase text-accent">
                      new
                    </span>
                  )}
                  {!isEquity && <AgentBadge verdict={token.agent} />}
                </div>
                <div className="mt-0.5 truncate text-[10.5px] text-subtle">
                  {fmtUsd(token.volume24h)} vol · {fmtUsd(token.liquidityUsd)} liq
                  {!isEquity && token.ageMinutes !== null ? ` · ${fmtAge(token.ageMinutes)}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono-num text-[13px]">{fmtUsd(token.priceUsd, false)}</div>
                <Pct v={token.change24h} />
              </div>
            </div>
          );
        })}
      </div>

      {/* table */}
      <div className="card-frame mt-3 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.12em] text-subtle">
              <th className="px-4 py-3 font-semibold">Token</th>
              <th className="px-3 py-3 font-semibold">Price</th>
              {!isEquity && (
                <th className="cursor-pointer px-3 py-3 font-semibold" onClick={() => onSort("ageMinutes")}>
                  Age{sortArrow("ageMinutes")}
                </th>
              )}
              <th className="cursor-pointer px-3 py-3 font-semibold" onClick={() => onSort("change24h")}>
                {isEquity ? `Prem/Disc${sortArrow("change24h")}` : `24h${sortArrow("change24h")}`}
              </th>
              {!isEquity && <th className="px-3 py-3 font-semibold">1h</th>}
              <th className="cursor-pointer px-3 py-3 font-semibold" onClick={() => onSort("volume24h")}>
                Vol 24h{sortArrow("volume24h")}
              </th>
              <th className="cursor-pointer px-3 py-3 font-semibold" onClick={() => onSort("liquidityUsd")}>
                Liquidity{sortArrow("liquidityUsd")}
              </th>
              {!isEquity && (
                <th className="cursor-pointer px-3 py-3 font-semibold" onClick={() => onSort("mcap")}>
                  MCap{sortArrow("mcap")}
                </th>
              )}
              {!isEquity && <th className="px-3 py-3 font-semibold">Txns</th>}
              {!isEquity && <th className="px-3 py-3 font-semibold">Agent</th>}
              <th className="px-3 py-3 font-semibold">Chart</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((token) => {
              const tick = ticks.get(token.address);
              const clickable = token.address.startsWith("0x");
              return (
                <tr
                  key={token.address}
                  onClick={() => clickable && router.push(`/terminal/t/${token.address}`)}
                  className={`border-b border-border/60 transition-colors last:border-0 ${
                    clickable ? "cursor-pointer hover:bg-raised/50" : ""
                  } ${tick === "up" ? "tick-up" : tick === "down" ? "tick-down" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <TokenAvatar imageUrl={token.imageUrl} symbol={token.symbol} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{token.symbol}</span>
                          {token.fresh && (
                            <span className="rounded border border-accent/40 bg-accent/10 px-1 py-px text-[9px] font-bold uppercase text-accent">
                              new
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-subtle">
                          <span className="max-w-[130px] truncate">{token.name}</span>
                          {clickable && <span className="font-mono-num">{shortAddr(token.address)}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono-num">{fmtUsd(token.priceUsd, false)}</td>
                  {!isEquity && <td className="px-3 py-3 font-mono-num text-muted">{fmtAge(token.ageMinutes)}</td>}
                  <td className="px-3 py-3">
                    <Pct v={token.change24h} />
                  </td>
                  {!isEquity && (
                    <td className="px-3 py-3">
                      <Pct v={token.change1h} />
                    </td>
                  )}
                  <td className="px-3 py-3 font-mono-num">{fmtUsd(token.volume24h)}</td>
                  <td className="px-3 py-3 font-mono-num">{fmtUsd(token.liquidityUsd)}</td>
                  {!isEquity && <td className="px-3 py-3 font-mono-num">{fmtUsd(token.mcap)}</td>}
                  {!isEquity && (
                    <td className="px-3 py-3">
                      {token.buys24h !== null || token.sells24h !== null ? (
                        <div className="font-mono-num text-[11px]">
                          <span className="text-up">{fmtNum(token.buys24h)}</span>
                          <span className="text-subtle"> / </span>
                          <span className="text-down">{fmtNum(token.sells24h)}</span>
                        </div>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                  )}
                  {!isEquity && (
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <AgentBadge verdict={token.agent} />
                        <RiskChip label="T10" value={token.top10Pct} warnAt={35} dangerAt={60} />
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <Sparkline
                      data={token.spark}
                      up={(token.change24h ?? 0) >= 0}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {token.dexUrl ? (
                      <a
                        href={token.dexUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20"
                      >
                        Trade <ArrowUpRight size={11} />
                      </a>
                    ) : clickable ? (
                      <Link
                        href={`/terminal/t/${token.address}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-raised px-2.5 py-1.5 text-[11px] text-muted"
                      >
                        View
                      </Link>
                    ) : (
                      <span className="text-[11px] text-subtle">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!data && !error && (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center text-[13px] text-muted">
                  <div className="animate-pulse">
                    Scanning Robinhood Chain — pool events, prices, holder data…
                  </div>
                  <div className="mt-1 text-[11px] text-subtle">
                    First scan takes up to 20 seconds.
                  </div>
                </td>
              </tr>
            )}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center text-[13px] text-muted">
                  Nothing matches this filter right now.
                </td>
              </tr>
            )}
            {error && !data && (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center text-[13px] text-down">
                  {error} — retrying automatically.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-subtle">
        Prices and volumes from DexScreener, holder distribution and contract risk from the BOWYER
        agent scanner (RPC + Blockscout). Sparklines build from our own price snapshots and fill in
        over time. Agent verdicts are automated heuristics, not financial advice.
      </p>
    </div>
  );
}
