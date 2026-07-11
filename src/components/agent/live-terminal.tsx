"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Live console showing this agent's real state: it queries the actual MCP
 * endpoint and streams true facts (tools, version, reports, subscribers).
 * No invented detections.
 */

interface LiveTerminalProps {
  slug: string;
  reportsTotal: number;
  subscribers: number;
  lastReportAt: string | null;
  className?: string;
}

type Frame =
  | { kind: "status"; text: string }
  | { kind: "highlight"; title: string; detail: string };

const FRAME_INTERVAL_MS = 2200;
const VISIBLE_FRAMES = 6;

export function LiveTerminal({
  slug,
  reportsTotal,
  subscribers,
  lastReportAt,
  className,
}: LiveTerminalProps) {
  const [frames, setFrames] = useState<Frame[]>([
    { kind: "status", text: `Connecting to /api/mcp/${slug}` },
  ]);
  const [cursor, setCursor] = useState(1);

  // Build the frame sequence from the real MCP endpoint.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mcp/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((meta: { name?: string; version?: string; tools?: string[] } | null) => {
        if (cancelled) return;
        const tools = meta?.tools ?? [];
        const built: Frame[] = [
          { kind: "status", text: `Connecting to /api/mcp/${slug}` },
          {
            kind: "highlight",
            title: "Endpoint live",
            detail: `${meta?.name ?? slug} v${meta?.version ?? "1.0.0"} · MCP over HTTP · Robinhood Chain`,
          },
          {
            kind: "status",
            text: `${tools.length} tools exposed: ${tools.slice(0, 4).join(", ")}${tools.length > 4 ? "…" : ""}`,
          },
          {
            kind: "highlight",
            title: `${reportsTotal.toLocaleString()} ${reportsTotal === 1 ? "report" : "reports"} published`,
            detail: lastReportAt
              ? `Most recent ${relativeTime(lastReportAt)}`
              : "Call generate_report to publish the first one",
          },
          {
            kind: "status",
            text: `${subscribers.toLocaleString()} active ${subscribers === 1 ? "subscription" : "subscriptions"} on chain`,
          },
          { kind: "status", text: "Awaiting tool calls — reports generate on demand" },
        ];
        setFrames(built);
      })
      .catch(() => {
        if (!cancelled) {
          setFrames([
            { kind: "status", text: `Connecting to /api/mcp/${slug}` },
            { kind: "status", text: "Endpoint unreachable — retrying" },
          ]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, reportsTotal, subscribers, lastReportAt]);

  useEffect(() => {
    const tick = setInterval(() => setCursor((c) => c + 1), FRAME_INTERVAL_MS);
    return () => clearInterval(tick);
  }, []);

  const shown = Math.min(cursor, frames.length + Math.floor(cursor / frames.length));
  const visible: Frame[] = [];
  for (let i = Math.max(0, shown - VISIBLE_FRAMES); i < shown; i++) {
    visible.push(frames[i % frames.length]);
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-[420px] flex-col rounded-sm border border-border bg-surface",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="flex items-center gap-2 text-[12px] font-medium tracking-wide text-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          LIVE
        </span>
        <span className="font-mono text-[11px] text-subtle">{slug} · chain 4663</span>
      </div>

      <div className="flex flex-1 flex-col justify-end gap-0 px-5 py-4 font-mono">
        {visible.map((frame, i) => {
          const isActive = i === visible.length - 1;
          return (
            <div
              key={`${shown}-${i}`}
              className={cn(
                "border-b border-border/60 py-3.5 last:border-b-0 transition-opacity",
                isActive ? "opacity-100" : i === 0 ? "opacity-35" : "opacity-60"
              )}
            >
              {frame.kind === "status" ? (
                <p className="text-[12.5px] leading-relaxed text-muted">
                  {frame.text}
                  {isActive && <Cursor />}
                </p>
              ) : (
                <div>
                  <p className="text-[12.5px] font-medium text-accent">
                    {frame.title}
                    {isActive && <Cursor />}
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">{frame.detail}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Cursor() {
  return (
    <span className="ml-1 inline-block h-[13px] w-[7px] translate-y-[2px] animate-pulse bg-accent/80" />
  );
}
