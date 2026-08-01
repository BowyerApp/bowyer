"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Copy, Check, Globe, ShieldCheck } from "lucide-react";
import type { TokenDetail } from "@/lib/market-data";
import {
  AgentBadge,
  Pct,
  StatBlock,
  TokenAvatar,
  fmtAge,
  fmtNum,
  fmtUsd,
  shortAddr,
  timeAgo,
} from "@/components/terminal/widgets";

const POLL_MS = 30_000;

function CopyAddr({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(address).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 font-mono-num text-[11px] text-subtle transition-colors hover:text-foreground"
    >
      {shortAddr(address)} {copied ? <Check size={11} className="text-up" /> : <Copy size={11} />}
    </button>
  );
}

export function TokenView({ address }: { address: string }) {
  const [detail, setDetail] = useState<TokenDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/token/${address}`, { cache: "no-store" });
      const body = (await res.json()) as ({ ok: true } & TokenDetail) | { ok: false; error: string };
      if (!body.ok) throw new Error(body.error);
      setDetail(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load token");
    }
  }, [address]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (error && !detail) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6 text-center">
        <div>
          <div className="text-[14px] text-down">{error}</div>
          <div className="mt-2 text-[12px] text-subtle">
            Check the address, or the token may have no on-chain activity yet.
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="animate-pulse text-[13px] text-muted">
          Pulling live pair data, contract scan and trades…
        </div>
      </div>
    );
  }

  const { token, scan, trades, pairs } = detail;
  const holders = scan?.holders;

  return (
    <div className="px-4 py-6 lg:px-8">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TokenAvatar imageUrl={token.imageUrl} symbol={token.symbol} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{token.symbol}</h1>
              <span className="text-[13px] text-muted">{token.name}</span>
              <AgentBadge verdict={token.agent} />
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px]">
              <CopyAddr address={token.address} />
              <a href={token.explorerUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-subtle transition-colors hover:text-foreground">
                Explorer <ArrowUpRight size={10} />
              </a>
              {token.website && (
                <a href={token.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-subtle transition-colors hover:text-foreground">
                  <Globe size={10} /> Site
                </a>
              )}
              {token.twitter && (
                <a href={token.twitter} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-subtle transition-colors hover:text-foreground">
                  𝕏
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono-num text-2xl font-bold">{fmtUsd(token.priceUsd, false)}</div>
          <div className="mt-0.5 flex items-center justify-end gap-2 text-[12px]">
            <Pct v={token.change24h} /> <span className="text-subtle">24h</span>
          </div>
        </div>
      </div>

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatBlock label="Market cap" value={fmtUsd(token.mcap)} />
        <StatBlock label="Liquidity" value={fmtUsd(token.liquidityUsd)} />
        <StatBlock label="Vol 24h" value={fmtUsd(token.volume24h)} />
        <StatBlock
          label="Buys / sells 24h"
          value={
            <span>
              <span className="text-up">{fmtNum(token.buys24h)}</span>
              <span className="text-subtle"> / </span>
              <span className="text-down">{fmtNum(token.sells24h)}</span>
            </span>
          }
        />
        <StatBlock label="Holders" value={holders?.count !== null && holders?.count !== undefined ? fmtNum(holders.count) : "—"} />
        <StatBlock label="Pair age" value={fmtAge(token.ageMinutes)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {/* chart */}
        <div className="card-frame overflow-hidden xl:col-span-2">
          {token.pairAddress ? (
            <iframe
              title="chart"
              src={`https://dexscreener.com/robinhood/${token.pairAddress}?embed=1&theme=dark&trades=0&info=0`}
              className="h-[460px] w-full border-0"
              allow="clipboard-write"
            />
          ) : (
            <div className="flex h-[460px] items-center justify-center text-[13px] text-muted">
              No indexed trading pair yet — chart appears once DexScreener picks up the pool.
            </div>
          )}
        </div>

        {/* agent audit + trade */}
        <div className="flex flex-col gap-4">
          <div className="card-frame px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                <ShieldCheck size={14} className="text-accent" /> Agent audit
              </div>
              {scan && (
                <span className="font-mono-num text-[11px] text-subtle">
                  risk {scan.riskScore}/100
                </span>
              )}
            </div>
            {scan ? (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <AgentBadge verdict={token.agent} />
                  <span className="text-[11px] capitalize text-muted">{scan.riskLevel} risk</span>
                </div>
                {scan.flags.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {scan.flags.slice(0, 6).map((flag) => (
                      <li key={flag} className="flex gap-2 text-[11.5px] leading-snug text-muted">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#e8b04b]" />
                        {flag}
                      </li>
                    ))}
                  </ul>
                )}
                {holders?.topHolders && holders.topHolders.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-subtle">
                      <span>Top holders</span>
                      {holders.top10Pct !== null && <span className="font-mono-num">top10 {Math.round(holders.top10Pct)}%</span>}
                    </div>
                    <div className="space-y-1.5">
                      {holders.topHolders.slice(0, 5).map((holder) => (
                        <div key={holder.address} className="flex items-center gap-2">
                          <a
                            href={`https://robinhoodchain.blockscout.com/address/${holder.address}`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-24 shrink-0 truncate font-mono-num text-[10.5px] text-subtle hover:text-foreground"
                          >
                            {holder.label ?? shortAddr(holder.address)}
                          </a>
                          <div className="h-1.5 flex-1 overflow-hidden rounded bg-raised">
                            <div
                              className="h-full rounded bg-accent/60"
                              style={{ width: `${Math.min(100, holder.pct)}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right font-mono-num text-[10.5px] text-muted">
                            {holder.pct.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-3 text-[12px] text-muted">
                Contract scan unavailable for this address right now.
              </div>
            )}
          </div>

          {token.dexUrl && (
            <a
              href={token.dexUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-md border border-accent/50 bg-accent/15 px-4 py-3 text-[13px] font-bold text-accent transition-colors hover:bg-accent/25"
            >
              Trade on {token.dexId ?? "DEX"} <ArrowUpRight size={14} />
            </a>
          )}

          {pairs.length > 1 && (
            <div className="card-frame px-4 py-3">
              <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-subtle">All pools</div>
              <div className="space-y-1.5">
                {pairs.map((pair) => (
                  <a
                    key={pair.pairAddress}
                    href={pair.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between text-[11.5px] text-muted transition-colors hover:text-foreground"
                  >
                    <span>
                      {pair.dexId} · {token.symbol}/{pair.quoteSymbol ?? "?"}
                    </span>
                    <span className="font-mono-num">{fmtUsd(pair.liquidityUsd)} liq</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* trades */}
      <div className="card-frame mt-4 overflow-x-auto">
        <div className="border-b border-border px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
          Live trades <span className="ml-1 normal-case tracking-normal text-subtle">— base-token transfers through the main pool</span>
        </div>
        <table className="w-full min-w-[640px] text-[12px]">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.12em] text-subtle">
              <th className="px-4 py-2.5 font-semibold">Time</th>
              <th className="px-3 py-2.5 font-semibold">Side</th>
              <th className="px-3 py-2.5 font-semibold">Amount</th>
              <th className="px-3 py-2.5 font-semibold">Value</th>
              <th className="px-3 py-2.5 font-semibold">Wallet</th>
              <th className="px-3 py-2.5 font-semibold">Tx</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={`${trade.hash}-${trade.wallet}-${trade.amount}`} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 font-mono-num text-subtle">{trade.timestamp ? `${timeAgo(trade.timestamp)} ago` : "—"}</td>
                <td className={`px-3 py-2.5 font-bold uppercase ${trade.side === "buy" ? "text-up" : "text-down"}`}>
                  {trade.side}
                </td>
                <td className="px-3 py-2.5 font-mono-num">
                  {fmtNum(trade.amount)} {token.symbol}
                </td>
                <td className="px-3 py-2.5 font-mono-num">{fmtUsd(trade.amountUsd)}</td>
                <td className="px-3 py-2.5">
                  <a
                    href={`https://robinhoodchain.blockscout.com/address/${trade.wallet}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono-num text-muted hover:text-foreground"
                  >
                    {shortAddr(trade.wallet)}
                  </a>
                </td>
                <td className="px-3 py-2.5">
                  <a
                    href={`https://robinhoodchain.blockscout.com/tx/${trade.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-subtle hover:text-foreground"
                  >
                    <ArrowUpRight size={12} />
                  </a>
                </td>
              </tr>
            ))}
            {trades.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[12px] text-subtle">
                  No pool trades indexed in the last page of transfers.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
