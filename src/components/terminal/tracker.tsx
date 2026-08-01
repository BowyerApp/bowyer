"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownLeft, Search, X } from "lucide-react";
import type { WalletSummary } from "@/lib/market-data";
import { StatBlock, fmtNum, fmtUsd, shortAddr, timeAgo } from "@/components/terminal/widgets";

const WATCHLIST_KEY = "bowyer.terminal.watchlist";

const PRESETS: { label: string; address: string }[] = [
  { label: "BOWYER treasury", address: "0xcd36ed0a2f9aa87880fa87c4a880931243020cfd" },
  { label: "$BOWYER contract", address: "0xaf4c10fef50059d1e3e8ab1c80e46db6a76098b4" },
];

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed.filter((a) => /^0x[a-f0-9]{40}$/.test(a)) : [];
  } catch {
    return [];
  }
}

export function TrackerView() {
  const [input, setInput] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);

  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);

  const inspect = useCallback(async (address: string) => {
    const normalized = address.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
      setError("Paste a full wallet address (0x + 40 hex characters).");
      return;
    }
    setActive(normalized);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/wallet/${normalized}`, { cache: "no-store" });
      const body = (await res.json()) as ({ ok: true } & WalletSummary) | { ok: false; error: string };
      if (!body.ok) throw new Error(body.error);
      setSummary(body);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleWatch = (address: string) => {
    setWatchlist((current) => {
      const next = current.includes(address)
        ? current.filter((a) => a !== address)
        : [...current, address].slice(0, 12);
      try {
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      } catch {
        // localStorage may be unavailable; watchlist just won't persist.
      }
      return next;
    });
  };

  return (
    <div className="px-4 py-6 lg:px-8">
      <div className="sun-rays card-frame px-5 py-5">
        <h1 className="text-xl font-bold tracking-tight">Wallet tracker</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
          Inspect any Robinhood Chain wallet — native balance, token holdings and the latest
          transfers, straight from Blockscout.
        </p>
        <div className="relative mt-4 max-w-xl">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && inspect(input)}
            placeholder="0x…"
            spellCheck={false}
            className="w-full rounded-md border border-border bg-raised py-2.5 pl-9 pr-24 font-mono-num text-[12px] placeholder:text-subtle focus:border-accent/40 focus:outline-none"
          />
          <button
            onClick={() => inspect(input)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent transition-colors hover:bg-accent/20"
          >
            Inspect
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.address}
              onClick={() => inspect(preset.address)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                active === preset.address
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-raised text-muted hover:text-foreground"
              }`}
            >
              {preset.label}
            </button>
          ))}
          {watchlist
            .filter((a) => !PRESETS.some((p) => p.address === a))
            .map((address) => (
              <span
                key={address}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono-num text-[11px] ${
                  active === address
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-raised text-muted"
                }`}
              >
                <button onClick={() => inspect(address)}>{shortAddr(address)}</button>
                <button onClick={() => toggleWatch(address)} className="text-subtle hover:text-down">
                  <X size={10} />
                </button>
              </span>
            ))}
        </div>
        {error && <div className="mt-3 text-[12px] text-down">{error}</div>}
      </div>

      {loading && (
        <div className="mt-10 text-center text-[13px] text-muted">
          <span className="animate-pulse">Reading wallet from Blockscout…</span>
        </div>
      )}

      {summary && !loading && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-mono-num text-[13px]">{shortAddr(summary.address)}</span>
              <a
                href={summary.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-subtle transition-colors hover:text-foreground"
              >
                Explorer <ArrowUpRight size={11} />
              </a>
            </div>
            <button
              onClick={() => toggleWatch(summary.address)}
              className="rounded-md border border-border bg-raised px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-foreground"
            >
              {watchlist.includes(summary.address) ? "Unwatch" : "+ Watchlist"}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatBlock
              label="ETH balance"
              value={summary.ethBalance !== null ? `${summary.ethBalance.toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH` : "—"}
            />
            <StatBlock label="USDG" value={summary.usdgBalance !== null ? fmtUsd(summary.usdgBalance) : "—"} />
            <StatBlock label="Tokens held" value={summary.holdings.length} />
            <StatBlock label="Recent transfers" value={summary.activity.length} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* holdings */}
            <div className="card-frame overflow-hidden">
              <div className="border-b border-border px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                Holdings
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-[12px]">
                  <tbody>
                    {summary.holdings.map((holding) => (
                      <tr key={holding.token} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold">{holding.symbol ?? "?"}</div>
                          <div className="max-w-[160px] truncate text-[10.5px] text-subtle">
                            {holding.name ?? shortAddr(holding.token)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono-num text-muted">
                          {fmtNum(holding.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-num">
                          {holding.valueUsd !== null ? fmtUsd(holding.valueUsd) : <span className="text-subtle">unpriced</span>}
                        </td>
                      </tr>
                    ))}
                    {summary.holdings.length === 0 && (
                      <tr>
                        <td className="px-4 py-10 text-center text-subtle">No ERC-20 holdings found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* activity */}
            <div className="card-frame overflow-hidden">
              <div className="border-b border-border px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                Latest transfers
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-[12px]">
                  <tbody>
                    {summary.activity.map((item, index) => (
                      <tr key={`${item.hash}-${index}`} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 font-bold uppercase ${
                              item.direction === "in" ? "text-up" : "text-down"
                            }`}
                          >
                            {item.direction === "in" ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                            {item.direction}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono-num text-muted">{fmtNum(item.amount)}</td>
                        <td className="px-3 py-2.5">
                          <a
                            href={`https://robinhoodchain.blockscout.com/address/${item.counterparty}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono-num text-[11px] text-subtle hover:text-foreground"
                          >
                            {item.direction === "in" ? "from" : "to"} {shortAddr(item.counterparty)}
                          </a>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono-num text-[11px] text-subtle">
                          {item.timestamp ? `${timeAgo(item.timestamp)} ago` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <a
                            href={`https://robinhoodchain.blockscout.com/tx/${item.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-subtle hover:text-foreground"
                          >
                            <ArrowUpRight size={12} />
                          </a>
                        </td>
                      </tr>
                    ))}
                    {summary.activity.length === 0 && (
                      <tr>
                        <td className="px-4 py-10 text-center text-subtle">No recent ERC-20 transfers.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
