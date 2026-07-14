"use client";

import { useState } from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import type { PlatformModelEntry } from "@/lib/llm-config";
import { cn } from "@/lib/utils";

interface PlatformModelAccordionProps {
  models: PlatformModelEntry[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** When false, rows only expand — no selection (e.g. token locked). */
  selectable?: boolean;
  /** Premium tier locked until wallet holds $BOWYER. */
  tokenGated?: boolean;
}

export function PlatformModelAccordion({
  models,
  selectedId,
  onSelect,
  selectable = true,
  tokenGated = false,
}: PlatformModelAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {models.map((m) => {
        const open = openId === m.id;
        const selected = selectable && selectedId === m.id;
        const locked = m.comingSoon || (!selectable && (tokenGated || !onSelect));

        return (
          <div
            key={m.id}
            className={cn(
              "overflow-hidden rounded-lg border border-white/[0.07] bg-[#151c24] font-mono transition-colors",
              selected && "border-accent/45 bg-accent/[0.04]",
              locked && !open && "opacity-90"
            )}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : m.id)}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[14px] font-semibold tracking-tight text-foreground">
                    {m.name}
                  </span>
                  {selected && (
                    <Check className="size-3.5 shrink-0 text-accent" strokeWidth={2.5} />
                  )}
                  {m.comingSoon && (
                    <span className="rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-accent">
                      Coming soon
                    </span>
                  )}
                  {tokenGated && m.premium && !selectable && (
                    <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-subtle">
                      Locked
                    </span>
                  )}
                  {m.badge && !m.comingSoon && (
                    <span className="text-[10px] uppercase tracking-wide text-subtle">
                      {m.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{m.blurb}</p>
              </div>
              <ChevronDown
                className={cn(
                  "mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-200",
                  open && "rotate-180"
                )}
                strokeWidth={1.75}
              />
            </button>

            {open && (
              <div className="border-t border-white/[0.06] px-4 py-3.5 text-[12px] leading-relaxed text-muted">
                <p>
                  <span className="text-subtle">Provider</span>
                  <span className="text-foreground/80"> · {m.provider}</span>
                </p>
                <p className="mt-1.5">
                  <span className="text-subtle">Model id</span>
                  <span className="text-foreground/80"> · {m.model}</span>
                </p>
                {m.comingSoon ? (
                  <p className="mt-3 flex items-center gap-1.5 text-accent/90">
                    <Lock className="size-3 shrink-0" strokeWidth={2} />
                    Gated by $BOWYER — rolling out with the protocol token launch.
                  </p>
                ) : tokenGated && m.premium && !selectable ? (
                  <p className="mt-3 flex items-center gap-1.5 text-muted">
                    <Lock className="size-3 shrink-0" strokeWidth={2} />
                    Hold $BOWYER in your connected wallet to unlock this model.
                  </p>
                ) : (
                  onSelect && (
                    <button
                      type="button"
                      onClick={() => onSelect(m.id)}
                      className={cn(
                        "mt-3 rounded-md border px-3 py-1.5 text-[11px] uppercase tracking-wide transition-colors",
                        selected
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-white/10 text-foreground hover:border-accent/40 hover:bg-accent/[0.06]"
                      )}
                    >
                      {selected ? "Selected" : "Use this model"}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
