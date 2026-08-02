"use client";

import { useState } from "react";
import type { AgentVerdict } from "@/lib/market-data";

/* ---------- formatting ---------- */

export function fmtUsd(value: number | null | undefined, compact = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (compact) {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  }
  if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (value <= 0) return "$0";
  return `$${value.toPrecision(3)}`;
}

export function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

export function fmtAge(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
}

export function shortAddr(address: string): string {
  if (!address.startsWith("0x") || address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function timeAgo(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/* ---------- atoms ---------- */

export function Pct({ v, className = "" }: { v: number | null; className?: string }) {
  if (v === null || !Number.isFinite(v)) {
    return <span className={`font-mono-num text-subtle ${className}`}>—</span>;
  }
  return (
    <span className={`font-mono-num ${v >= 0 ? "text-up" : "text-down"} ${className}`}>
      {v >= 0 ? "+" : ""}
      {Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}%
    </span>
  );
}

export function Sparkline({
  data,
  width = 88,
  height = 26,
  up,
}: {
  data: number[];
  width?: number;
  height?: number;
  up: boolean;
}) {
  if (data.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex shrink-0 items-center text-[9px] uppercase tracking-wide text-subtle"
      >
        collecting
      </div>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 2) - 1}`
    )
    .join(" ");
  const color = up ? "#2dd4a7" : "#f45d7e";
  const id = `sg-${up ? "u" : "d"}`;
  return (
    <svg width={width} height={height} className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function TokenAvatar({
  imageUrl,
  symbol,
  size = "md",
}: {
  imageUrl: string | null;
  symbol: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-[13px]", lg: "h-12 w-12 text-[16px]" };
  const [broken, setBroken] = useState(false);
  const initials = symbol.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  return (
    <div
      className={`flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border bg-raised font-bold text-muted ${sizes[size]}`}
    >
      {imageUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
          loading="lazy"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

export function AgentBadge({ verdict }: { verdict: AgentVerdict | null }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-border bg-raised px-1.5 py-[3px] text-[10px] leading-none text-subtle">
        queued
      </span>
    );
  }
  const map = {
    passed: { label: "Passed", cls: "text-up border-[#2dd4a7]/30 bg-[#2dd4a7]/8" },
    review: { label: "Review", cls: "text-gold border-[#e8b04b]/30 bg-[#e8b04b]/8" },
    failed: { label: "Failed", cls: "text-down border-[#f45d7e]/30 bg-[#f45d7e]/8" },
  } as const;
  const item = map[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-[3px] text-[10px] font-semibold leading-none ${item.cls}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {item.label}
    </span>
  );
}

export function RiskChip({
  label,
  value,
  warnAt,
  dangerAt,
  suffix = "%",
}: {
  label: string;
  value: number | null;
  warnAt: number;
  dangerAt: number;
  suffix?: string;
}) {
  if (value === null || !Number.isFinite(value)) return null;
  const level = value >= dangerAt ? "danger" : value >= warnAt ? "warn" : "ok";
  const cls = {
    ok: "text-up/80 border-border bg-raised",
    warn: "text-gold border-[#e8b04b]/30 bg-[#e8b04b]/8",
    danger: "text-down border-[#f45d7e]/30 bg-[#f45d7e]/8",
  }[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-[3px] font-mono-num text-[10px] leading-none ${cls}`}
    >
      {label} {Math.round(value)}
      {suffix}
    </span>
  );
}

export function StatBlock({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="card-frame px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-subtle">{label}</div>
      <div
        className={`mt-1 font-mono-num text-lg font-semibold ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
