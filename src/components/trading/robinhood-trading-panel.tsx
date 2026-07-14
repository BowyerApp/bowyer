"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Pause, Shield, Zap } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";
import type { TradingMode } from "@/lib/trading-policy";

interface ConnectionState {
  status: string;
  agenticAccountHint: string | null;
  mcpEndpoint: string;
  connectedAt: string | null;
}

interface PolicyState {
  mode: TradingMode;
  enabled: boolean;
  killSwitch: boolean;
  maxOrderUsd: number;
  maxPositionUsd: number;
  maxDailyLossUsd: number;
  maxDailyTrades: number;
  cashReserveUsd: number;
  allowedSymbols: string[];
  strategyNotes: string;
  version: number;
}

interface DecisionRow {
  id: number;
  symbol: string;
  side: string;
  thesis: string;
  confidence: number | null;
  policyAllowed: number;
  policyReasons: string[];
  status: string;
  mode: string;
  notionalUsd: number | null;
  createdAt: string;
}

const MODES: { id: TradingMode; label: string; detail: string }[] = [
  { id: "research", label: "Research", detail: "Intelligence only — no orders." },
  { id: "simulate", label: "Simulate", detail: "What-if analysis with disclosed assumptions." },
  { id: "paper", label: "Paper", detail: "Simulated fills — no broker submission." },
  { id: "approval", label: "Approval", detail: "Live orders require your explicit approval." },
  { id: "autonomous", label: "Autonomous", detail: "Auto-submit within hard limits you set." },
];

export function RobinhoodTradingPanel() {
  const { address, authenticate } = useWallet();
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [agenticUrl, setAgenticUrl] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autonomousAck, setAutonomousAck] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    if (!(await authenticate())) {
      setLoading(false);
      return;
    }
    try {
      const [policyRes, decisionsRes] = await Promise.all([
        fetch("/api/trading/policy"),
        fetch("/api/trading/decisions?limit=8"),
      ]);
      if (!policyRes.ok) throw new Error("Could not load trading policy");
      const policyData = await policyRes.json();
      setConnection(policyData.connection);
      setPolicy(policyData.policy);
      if (decisionsRes.ok) {
        const d = await decisionsRes.json();
        setDecisions(d.decisions ?? []);
      }
      const connRes = await fetch("/api/auth/robinhood");
      if (connRes.ok) {
        const c = await connRes.json();
        setAgenticUrl(c.agenticUrl ?? "");
        setDocsUrl(c.docsUrl ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [address, authenticate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function savePolicy(updates: Partial<PolicyState> & { mode?: TradingMode }) {
    if (!policy) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/trading/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...policy,
          ...updates,
          autonomousAck: updates.mode === "autonomous" ? autonomousAck : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setPolicy(data.policy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function linkRobinhood() {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/robinhood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Link failed");
      setConnection(data.connection);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link failed");
    } finally {
      setSaving(false);
    }
  }

  async function decisionAction(id: number, action: "approve" | "reject") {
    const res = await fetch("/api/trading/decisions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (res.ok) void refresh();
  }

  if (!address) {
    return (
      <div className="rounded-sm border border-border bg-surface/60 p-8">
        <p className="text-[15px] font-medium text-foreground">Connect your wallet to configure trading.</p>
        <p className="mt-2 text-[13px] text-muted">Policy, approvals, and audit history are bound to your BOWYER wallet session.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="rounded-sm border border-border bg-surface/60 p-8 text-[13px] text-muted">Loading trading console…</div>;
  }

  const linked = connection?.status === "linked";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 rounded-sm border border-border bg-surface/60 p-8 lg:flex-row lg:items-start">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-sm border border-white/10">
          <Image
            src="/images/agents/robinhood-trading-agent.png"
            alt="Robinhood Trading Agent"
            fill
            className="object-cover"
          />
        </div>
        <div className="flex-1">
          <p className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-accent">
            <Zap className="size-3.5" strokeWidth={2} />
            Agentic Trading
          </p>
          <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            Robinhood Trading Console
          </h3>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Connect through Robinhood&apos;s official Trading MCP. Orders execute only in your separately funded Agentic Account,
            behind deterministic risk gates you control.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={agenticUrl || "https://robinhood.com/us/en/agentic-trading/"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 px-4 text-[13px] text-foreground transition-opacity hover:opacity-90"
            >
              Open Robinhood setup <ExternalLink className="size-3.5" />
            </a>
            <a
              href={docsUrl || "https://robinhood.com/us/en/support/articles/agentic-trading-overview/"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-[13px] text-muted transition-colors hover:text-foreground"
            >
              MCP docs
            </a>
            {!linked ? (
              <button
                type="button"
                onClick={() => void linkRobinhood()}
                disabled={saving}
                className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Mark connected
              </button>
            ) : (
              <span className="inline-flex h-9 items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 text-[13px] text-accent">
                <Shield className="size-3.5" /> Linked
              </span>
            )}
          </div>
          {connection?.mcpEndpoint && (
            <p className="mt-4 font-mono text-[11px] text-subtle break-all">{connection.mcpEndpoint}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">{error}</div>
      )}

      {policy && (
        <div className="rounded-sm border border-border bg-surface/60 p-8">
          <h4 className="text-[18px] font-semibold text-foreground">Risk policy</h4>
          <p className="mt-1 text-[13px] text-muted">Version {policy.version} · enforced server-side before any broker call.</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void savePolicy({ mode: m.id })}
                disabled={saving}
                className={cn(
                  "rounded-sm border p-4 text-left transition-colors",
                  policy.mode === m.id ? "border-accent bg-accent/5" : "border-border hover:border-white/20"
                )}
              >
                <p className="text-[14px] font-medium text-foreground">{m.label}</p>
                <p className="mt-1 text-[12px] text-muted">{m.detail}</p>
              </button>
            ))}
          </div>

          {policy.mode === "autonomous" && (
            <label className="mt-4 flex items-start gap-3 text-[13px] text-muted">
              <input
                type="checkbox"
                checked={autonomousAck}
                onChange={(e) => setAutonomousAck(e.target.checked)}
                className="mt-0.5"
              />
              I understand autonomous mode can place trades without per-order approval and I accept full responsibility.
            </label>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["maxOrderUsd", "Max order ($)"],
                ["maxPositionUsd", "Max position ($)"],
                ["maxDailyLossUsd", "Daily loss cap ($)"],
                ["maxDailyTrades", "Daily trades"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-[12px] text-muted">{label}</span>
                <input
                  type="number"
                  value={policy[key]}
                  onChange={(e) => setPolicy({ ...policy, [key]: Number(e.target.value) })}
                  onBlur={() => void savePolicy({ [key]: policy[key] })}
                  className="input-dark mt-1 h-9 w-full text-[13px]"
                />
              </label>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="text-[12px] text-muted">Strategy notes</span>
            <textarea
              value={policy.strategyNotes}
              onChange={(e) => setPolicy({ ...policy, strategyNotes: e.target.value })}
              onBlur={() => void savePolicy({ strategyNotes: policy.strategyNotes })}
              rows={3}
              className="input-dark mt-1 w-full text-[13px]"
              placeholder="e.g. Focus on large-cap tech, 5–20 day swing horizon, trim above 15% single-name exposure."
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void savePolicy({ killSwitch: !policy.killSwitch })}
              disabled={saving}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-opacity",
                policy.killSwitch
                  ? "bg-red-500/20 text-red-200 border border-red-500/40"
                  : "border border-border text-muted hover:text-foreground"
              )}
            >
              <Pause className="size-3.5" />
              {policy.killSwitch ? "Kill switch ON" : "Activate kill switch"}
            </button>
          </div>
        </div>
      )}

      {decisions.length > 0 && (
        <div className="rounded-sm border border-border bg-surface/60 p-8">
          <h4 className="text-[18px] font-semibold text-foreground">Decision ledger</h4>
          <p className="mt-1 text-[13px] text-muted">Immutable proposals with policy outcomes.</p>
          <ul className="mt-6 space-y-4">
            {decisions.map((d) => (
              <li key={d.id} className="rounded-sm border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-medium text-foreground">
                    {d.side.toUpperCase()} {d.symbol}
                    {d.notionalUsd ? ` · $${d.notionalUsd}` : ""}
                  </p>
                  <span className="text-[12px] text-muted">{new Date(d.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-[13px] text-muted">{d.thesis}</p>
                {!d.policyAllowed && d.policyReasons.length > 0 && (
                  <p className="mt-2 text-[12px] text-red-300">Blocked: {d.policyReasons.join(" ")}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted">{d.status}</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted">{d.mode}</span>
                  {d.status === "proposed" && d.policyAllowed && policy?.mode === "approval" && (
                    <>
                      <button
                        type="button"
                        onClick={() => void decisionAction(d.id, "approve")}
                        className="text-[12px] text-accent hover:underline"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void decisionAction(d.id, "reject")}
                        className="text-[12px] text-muted hover:underline"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
