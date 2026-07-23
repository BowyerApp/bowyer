"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X, LayoutGrid, Swords, Rocket, Wallet, BookOpen } from "lucide-react";
import type { AgentSummary } from "@/lib/types";
import { FILTER_LABELS } from "@/lib/types";

/** Global ⌘K palette — patterns from dukelyuu/skills-marketplace + pacocoursey/cmdk */
const NAV_ITEMS = [
  { href: "/marketplace", label: "Explore", icon: LayoutGrid, keywords: "browse agents catalog explore" },
  { href: "/desk/arena", label: "Arena", icon: Swords, keywords: "compete leaderboard desk" },
  { href: "/launch", label: "Launch an agent", icon: Rocket, keywords: "publish mcp smithery" },
  { href: "/portfolio", label: "Portfolio", icon: Wallet, keywords: "holdings subscribe" },
  { href: "/docs", label: "Build", icon: BookOpen, keywords: "integration mcp github docs sdk templates" },
] as const;

interface CommandPaletteProps {
  agents: AgentSummary[];
}

export function CommandPalette({ agents }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filteredNav = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return NAV_ITEMS;
    return NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.includes(q) ||
        item.href.includes(q)
    );
  }, [query]);

  const filteredAgents = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return agents.slice(0, 6);
    return agents
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tagline.toLowerCase().includes(q) ||
          a.creator.name.toLowerCase().includes(q) ||
          a.tags.some((t) => t.includes(q)) ||
          FILTER_LABELS[a.filter].toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [agents, query]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((v) => !v);
    }
    if (e.key === "Escape") setOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-label="Close"
      />
      <div className="relative w-full max-w-lg bg-surface border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="size-4 text-subtle shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents, pages, capabilities…"
            className="flex-1 h-12 bg-transparent text-[14px] text-foreground placeholder:text-subtle focus:outline-none"
          />
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {filteredNav.length > 0 && (
            <div className="px-2 pb-2">
              <p className="px-2 py-1.5 text-[12px] text-subtle">Pages</p>
              <ul>
                {filteredNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          router.push(item.href);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface transition-colors duration-150 text-left"
                      >
                        <Icon className="size-4 text-muted shrink-0" />
                        <span className="text-[13px] text-foreground">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="px-2">
            <p className="px-2 py-1.5 text-[12px] text-subtle">Agents</p>
            <ul>
              {filteredAgents.length === 0 ? (
                <li className="px-3 py-4 text-center meta-text">No agents found</li>
              ) : (
                filteredAgents.map((agent) => (
                  <li key={agent.id}>
                    <Link
                      href={agent.profileReady ? `/agents/${agent.slug}` : "/marketplace"}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-4 px-3 py-2.5 hover:bg-surface transition-colors duration-150"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] text-foreground truncate">{agent.name}</p>
                        <p className="meta-text truncate">{agent.tagline}</p>
                      </div>
                      <span className="meta-text shrink-0">{FILTER_LABELS[agent.filter]}</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteHint() {
  return (
    <span className="hidden lg:inline-flex items-center gap-1 meta-text">
      <kbd className="px-1.5 py-0.5 rounded-sm border border-border bg-surface font-mono text-[12px]">⌘K</kbd>
    </span>
  );
}

export function openCommandPalette() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
}
