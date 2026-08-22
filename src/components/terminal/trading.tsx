"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  BrainCircuit,
  Check,
  Copy,
  Crosshair,
  Grid3x3,
  Pause,
  Play,
  TrendingUp,
  Waves,
  ArrowUpRight,
  RefreshCw,
  Download,
  Trash2,
} from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { Sparkline, timeAgo } from "@/components/terminal/widgets";

const EXPLORER = "https://robinhoodchain.blockscout.com";

interface Fill {
  id: string;
  side: "buy" | "sell";
  symbol: string;
  token: string;
  qty: number;
  priceUsd: number;
  valueUsd: number;
  txHash: string;
  reason: string;
  at: string;
}

interface Position {
  token: string;
  symbol: string;
  qty: number;
  avgCostUsd: number;
}

interface Instance {
  id: string;
  strategy: string;
  meta: { name: string; style: string; blurb: string };
  mode: "paper" | "live";
  status: "active" | "paused";
  walletAddress: string | null;
  createdAt: string;
  lastTickAt: string | null;
  lastNote: string | null;
  equityUsd: number;
  startUsd: number;
  pnlPct: number;
  positions: Position[];
  fills: Fill[];
  equitySeries: { at: string; equityUsd: number }[];
}

interface CatalogEntry {
  id: string;
  name: string;
  style: string;
  blurb: string;
  defaults: { clipUsd: number; maxPositionUsd: number; dailyTradeCap: number; stopLossPct: number };
}

interface ApiData {
  agents: Instance[];
  liveEnabled: boolean;
  stats: Record<string, { trades: number; winRate: number | null; liveSince: string | null }>;
  catalog: CatalogEntry[];
}

const ICONS: Record<string, typeof Crosshair> = {
  "momentum-sniper": Crosshair,
  "wave-rider": Waves,
  "grid-maker": Grid3x3,
  "dip-hunter": TrendingUp,
  "signal-analyst": BrainCircuit,
};

const TINTS: Record<string, string> = {
  "momentum-sniper": "#2dd4a7",
  "wave-rider": "#f45d7e",
  "grid-maker": "#e8b04b",
  "dip-hunter": "#b78af7",
  "signal-analyst": "#8ee83d",
};

/** Turn a pasted line into a typed knowledge source the API accepts. */
function detectSource(line: string): { type: string; url: string } | null {
  const s = line.trim();
  if (!s) return null;
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return { type: "wallet", url: `wallet://${s.toLowerCase()}` };
  const tg = /^(?:https?:\/\/)?t\.me\/(?:s\/)?([A-Za-z0-9_]{4,32})/i.exec(s);
  if (tg) return { type: "telegram", url: `telegram://channel/${tg[1]}` };
  if (/^@[A-Za-z0-9_]{4,32}$/.test(s)) return { type: "telegram", url: `telegram://channel/${s.slice(1)}` };
  if (!/^https?:\/\//i.test(s)) return null;
  if (/\.pdf(\?|#|$)/i.test(s)) return { type: "pdf", url: s };
  if (/github\.com\/[^/]+\/[^/]+/i.test(s)) return { type: "github", url: s };
  if (/(\/feed|\.xml|\/rss)/i.test(s)) return { type: "rss", url: s };
  if (/api\.|\/api\/|\.json(\?|#|$)/i.test(s)) return { type: "api", url: s };
  return { type: "website", url: s };
}

const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function TradingView() {
  const { address, connect, authenticate, sendUsdg, sendPayment } = useWallet();
  const [data, setData] = useState<ApiData | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [analystMode, setAnalystMode] = useState<"paper" | "live" | null>(null);
  const [analystBrief, setAnalystBrief] = useState("");
  const [analystSources, setAnalystSources] = useState("");

  const load = useCallback(
    async (auth = true) => {
      if (!address) return;
      if (state === "idle") setState("loading");
      if (auth && !(await authenticate())) {
        setState("error");
        return;
      }
      try {
        const res = await fetch("/api/trading/agents");
        if (!res.ok) throw new Error(String(res.status));
        setData(await res.json());
        setState("ready");
      } catch {
        if (state !== "ready") setState("error");
      }
    },
    [address, authenticate, state]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!address || state !== "ready") return;
    const t = setInterval(() => load(false), 15_000);
    return () => clearInterval(t);
  }, [address, state, load]);

  const act = async (fn: () => Promise<Response>, key: string) => {
    setBusy(key);
    setNotice(null);
    try {
      const res = await fn();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(body.error ?? "Request failed");
      await load(false);
    } finally {
      setBusy(null);
    }
  };

  const createAgent = (
    strategy: string,
    mode: "paper" | "live",
    extra?: { brief?: string; sources?: { type: string; url: string }[] }
  ) =>
    act(
      () =>
        fetch("/api/trading/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy, mode, ...extra }),
        }),
      `create-${strategy}-${mode}`
    );

  const deployAnalyst = async () => {
    if (!analystMode) return;
    const sources = analystSources
      .split(/\n|,/)
      .map(detectSource)
      .filter((s): s is { type: string; url: string } => s !== null)
      .slice(0, 4);
    await createAgent("signal-analyst", analystMode, {
      brief: analystBrief.trim() || undefined,
      sources: sources.length > 0 ? sources : undefined,
    });
    setAnalystMode(null);
    setAnalystBrief("");
    setAnalystSources("");
  };

  const patch = (id: string, action: "pause" | "resume") =>
    act(
      () =>
        fetch("/api/trading/agents", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        }),
      `${action}-${id}`
    );

  const remove = (id: string) =>
    act(
      () =>
        fetch("/api/trading/agents", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
      `delete-${id}`
    );

  const withdraw = (id: string) =>
    act(
      () =>
        fetch("/api/trading/withdraw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
      `withdraw-${id}`
    );

  const rescan = (id: string) =>
    act(
      () =>
        fetch("/api/trading/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
      `rescan-${id}`
    );

  if (!address) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Header />
        <div className="card-frame mt-6 flex flex-col items-center gap-3 rounded-lg p-10 text-center">
          <Bot size={22} className="text-subtle" />
          <p className="text-[13px] text-muted">Connect your wallet to deploy trading agents.</p>
          <button
            type="button"
            onClick={() => connect()}
            className="mt-1 rounded-md bg-accent px-4 py-2 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Header />

      {notice && (
        <div className="mt-4 rounded-md border border-[#e8b04b]/40 bg-[#e8b04b]/10 px-3 py-2 text-[12px] text-gold">
          {notice}
        </div>
      )}

      {state === "loading" || state === "idle" ? (
        <div className="card-frame mt-6 rounded-lg p-10 text-center text-[12.5px] text-muted">
          Loading your trading desk…
        </div>
      ) : state === "error" ? (
        <div className="card-frame mt-6 rounded-lg p-10 text-center text-[12.5px] text-muted">
          Sign the session request to continue.{" "}
          <button type="button" onClick={() => load()} className="text-accent underline-offset-2 hover:underline">
            Retry
          </button>
        </div>
      ) : data ? (
        <>
          {data.agents.length > 0 && (
            <div className="mt-6 flex flex-col gap-3">
              {data.agents.map((a) => (
                <InstanceCard
                  key={a.id}
                  a={a}
                  busy={busy}
                  onPause={() => patch(a.id, "pause")}
                  onResume={() => patch(a.id, "resume")}
                  onDelete={() => remove(a.id)}
                  onWithdraw={() => withdraw(a.id)}
                  onRescan={() => rescan(a.id)}
                  sendUsdg={sendUsdg}
                  sendPayment={sendPayment}
                />
              ))}
            </div>
          )}

          <h2 className="mt-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
            Strategies
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.catalog.map((c) => {
              const Icon = ICONS[c.id] ?? Bot;
              const tint = TINTS[c.id] ?? "#2dd4a7";
              const stat = data.stats[c.id];
              return (
                <div key={c.id} className="card-frame flex flex-col rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-md border"
                      style={{ borderColor: `${tint}4d`, color: tint, background: `${tint}14` }}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-foreground">{c.name}</span>
                        <span
                          className="rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide"
                          style={{ borderColor: `${tint}4d`, color: tint }}
                        >
                          {c.style}
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{c.blurb}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 font-mono-num text-[11px] text-subtle">
                    {stat ? (
                      <>
                        <span>{stat.trades} fills</span>
                        <span>{stat.winRate !== null ? `${stat.winRate.toFixed(0)}% win` : "win rate pending"}</span>
                        <span>tracked since {stat.liveSince ? timeAgo(stat.liveSince) + " ago" : "—"}</span>
                      </>
                    ) : (
                      <span>no fills yet — stats build from real trades only</span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      disabled={busy === `create-${c.id}-paper`}
                      onClick={() =>
                        c.id === "signal-analyst" ? setAnalystMode("paper") : createAgent(c.id, "paper")
                      }
                      className="flex h-8 items-center rounded-md bg-accent px-3.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Run simulation
                    </button>
                    {data.liveEnabled && (
                      <button
                        type="button"
                        disabled={busy === `create-${c.id}-live`}
                        onClick={() =>
                          c.id === "signal-analyst" ? setAnalystMode("live") : createAgent(c.id, "live")
                        }
                        className="flex h-8 items-center rounded-md border border-border px-3.5 text-[12px] text-foreground transition-colors hover:border-accent/40 disabled:opacity-50"
                      >
                        Run live
                      </button>
                    )}
                  </div>
                  {c.id === "signal-analyst" && analystMode && (
                    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-raised/40 p-3">
                      <label className="text-[10.5px] font-semibold uppercase tracking-wide text-subtle">
                        Mandate — what should it trade and why?
                      </label>
                      <textarea
                        value={analystBrief}
                        onChange={(e) => setAnalystBrief(e.target.value)}
                        rows={2}
                        maxLength={600}
                        placeholder="e.g. Trade momentum on tokens with real volume. Follow whale wallet flows — sell when the whale sells. Stay in cash when nothing is moving."
                        className="w-full rounded-sm border border-border bg-background px-2.5 py-2 text-[12px] text-foreground outline-none placeholder:text-subtle focus:border-accent/60"
                      />
                      <label className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-subtle">
                        Data sources (optional, up to 4 — one per line)
                      </label>
                      <textarea
                        value={analystSources}
                        onChange={(e) => setAnalystSources(e.target.value)}
                        rows={3}
                        placeholder={"0x… wallet to watch\n@telegramchannel\nhttps://api.example.com/data.json"}
                        className="w-full rounded-sm border border-border bg-background px-2.5 py-2 font-mono text-[11.5px] text-foreground outline-none placeholder:text-subtle focus:border-accent/60"
                      />
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          disabled={busy === `create-signal-analyst-${analystMode}`}
                          onClick={deployAnalyst}
                          className="flex h-8 items-center rounded-md bg-accent px-3.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {analystMode === "live" ? "Deploy live analyst" : "Deploy analyst simulation"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalystMode(null)}
                          className="flex h-8 items-center rounded-md border border-border px-3 text-[12px] text-muted transition-colors hover:border-accent/40"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-6 rounded-lg border border-border bg-raised/40 p-4 text-[11.5px] leading-relaxed text-subtle">
            Simulations trade a virtual $1,000 at live market prices with realistic slippage. Live
            agents trade real funds from a dedicated wallet that can only swap on-chain and withdraw
            back to your address — nothing else. All stats come from recorded fills; there are no
            backtests. Trading is risky, past performance is not future results.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight text-foreground">Trading agents</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        Deploy a strategy on live Robinhood Chain data — simulation first, real execution when
        you arm it.
      </p>
    </div>
  );
}

function InstanceCard({
  a,
  busy,
  onPause,
  onResume,
  onDelete,
  onWithdraw,
  onRescan,
  sendUsdg,
  sendPayment,
}: {
  a: Instance;
  busy: string | null;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onWithdraw: () => void;
  onRescan: () => void;
  sendUsdg: (to: string, amount: number) => Promise<string>;
  sendPayment: (to: string, usd: number) => Promise<string>;
}) {
  const Icon = ICONS[a.strategy] ?? Bot;
  const tint = TINTS[a.strategy] ?? "#2dd4a7";
  const [copied, setCopied] = useState(false);
  const [depositBusy, setDepositBusy] = useState<string | null>(null);
  const pnlUp = a.pnlPct >= 0;
  const spark = a.equitySeries.map((p) => p.equityUsd);

  const deposit = async (kind: "usdg" | "gas") => {
    if (!a.walletAddress) return;
    setDepositBusy(kind);
    try {
      if (kind === "usdg") await sendUsdg(a.walletAddress, 50);
      else await sendPayment(a.walletAddress, 5);
      setTimeout(onRescan, 4000);
    } catch {
      // User rejected in wallet — nothing to do.
    } finally {
      setDepositBusy(null);
    }
  };

  return (
    <div className="card-frame rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex size-9 items-center justify-center rounded-md border"
          style={{ borderColor: `${tint}4d`, color: tint, background: `${tint}14` }}
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-foreground">{a.meta.name}</span>
            <span
              className={`rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
                a.mode === "live"
                  ? "border-[#f45d7e]/50 bg-[#f45d7e]/10 text-down"
                  : "border-border text-subtle"
              }`}
            >
              {a.mode === "live" ? "LIVE" : "SIM"}
            </span>
            <span
              className={`rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
                a.status === "active"
                  ? "border-[#2dd4a7]/40 bg-[#2dd4a7]/10 text-up"
                  : "border-border text-subtle"
              }`}
            >
              {a.status}
            </span>
          </div>
          <p className="mt-0.5 font-mono-num text-[10.5px] text-subtle">
            {a.lastNote ?? "waiting for first tick"}
            {a.lastTickAt ? ` · ${timeAgo(a.lastTickAt)} ago` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {spark.length > 1 && <Sparkline data={spark} width={90} height={28} up={pnlUp} />}
          <div className="text-right">
            <p className="font-mono-num text-[15px] font-bold text-foreground">${fmt(a.equityUsd)}</p>
            <p className={`font-mono-num text-[11px] ${pnlUp ? "text-up" : "text-down"}`}>
              {pnlUp ? "+" : ""}
              {fmt(a.pnlPct, 1)}%
            </p>
          </div>
        </div>
      </div>

      {a.positions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {a.positions.map((p) => (
            <span
              key={p.token}
              className="rounded border border-border bg-raised px-2 py-1 font-mono-num text-[10.5px] text-muted"
            >
              {p.symbol} · {p.qty > 1000 ? `${(p.qty / 1000).toFixed(1)}k` : p.qty.toFixed(2)} @ $
              {p.avgCostUsd < 0.01 ? p.avgCostUsd.toExponential(1) : fmt(p.avgCostUsd)}
            </span>
          ))}
        </div>
      )}

      {a.fills.length > 0 && (
        <div className="mt-3 divide-y divide-border border-t border-border">
          {a.fills.slice(0, 4).map((f) => (
            <div key={f.id} className="flex items-center gap-2.5 py-1.5 font-mono-num text-[10.5px]">
              <span className={`w-8 font-bold ${f.side === "buy" ? "text-up" : "text-down"}`}>
                {f.side.toUpperCase()}
              </span>
              <span className="text-foreground">{f.symbol}</span>
              <span className="text-subtle">${fmt(f.valueUsd)}</span>
              <span className="hidden truncate text-subtle sm:inline">— {f.reason}</span>
              <span className="ml-auto shrink-0 text-subtle">{timeAgo(f.at)} ago</span>
              {f.txHash !== "paper" && (
                <a
                  href={`${EXPLORER}/tx/${f.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-accent"
                >
                  <ArrowUpRight size={11} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {a.mode === "live" && a.walletAddress && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-raised/50 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
            Agent wallet
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(a.walletAddress!);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="flex items-center gap-1 font-mono-num text-[11px] text-foreground hover:text-accent"
          >
            {a.walletAddress.slice(0, 8)}…{a.walletAddress.slice(-6)}
            {copied ? <Check size={11} className="text-up" /> : <Copy size={11} />}
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={depositBusy !== null}
              onClick={() => deposit("usdg")}
              className="flex h-7 items-center rounded border border-border px-2.5 text-[11px] text-foreground transition-colors hover:border-accent/40 disabled:opacity-50"
            >
              {depositBusy === "usdg" ? "Confirm in wallet…" : "Deposit 50 USDG"}
            </button>
            <button
              type="button"
              disabled={depositBusy !== null}
              onClick={() => deposit("gas")}
              className="flex h-7 items-center rounded border border-border px-2.5 text-[11px] text-foreground transition-colors hover:border-accent/40 disabled:opacity-50"
            >
              {depositBusy === "gas" ? "Confirm in wallet…" : "Send gas (~$5 ETH)"}
            </button>
            <button
              type="button"
              onClick={onRescan}
              disabled={busy === `rescan-${a.id}`}
              className="flex h-7 items-center gap-1 rounded border border-border px-2.5 text-[11px] text-muted transition-colors hover:text-foreground disabled:opacity-50"
              title="Re-scan deposits"
            >
              <RefreshCw size={11} />
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        {a.status === "active" ? (
          <button
            type="button"
            onClick={onPause}
            disabled={busy === `pause-${a.id}`}
            className="flex h-7 items-center gap-1.5 rounded border border-border px-2.5 text-[11px] text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Pause size={11} /> Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={onResume}
            disabled={busy === `resume-${a.id}`}
            className="flex h-7 items-center gap-1.5 rounded border border-[#2dd4a7]/40 bg-[#2dd4a7]/10 px-2.5 text-[11px] text-up transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            <Play size={11} /> Resume
          </button>
        )}
        {a.mode === "live" ? (
          <button
            type="button"
            onClick={onWithdraw}
            disabled={busy === `withdraw-${a.id}`}
            className="flex h-7 items-center gap-1.5 rounded border border-border px-2.5 text-[11px] text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Download size={11} /> {busy === `withdraw-${a.id}` ? "Withdrawing…" : "Withdraw all"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy === `delete-${a.id}`}
            className="flex h-7 items-center gap-1.5 rounded border border-border px-2.5 text-[11px] text-muted transition-colors hover:text-down disabled:opacity-50"
          >
            <Trash2 size={11} /> Delete
          </button>
        )}
        <span className="ml-auto font-mono-num text-[10px] text-subtle">
          started {timeAgo(a.createdAt)} ago · baseline ${fmt(a.startUsd, 0)}
        </span>
      </div>
    </div>
  );
}

