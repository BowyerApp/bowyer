"use client";

import { Search } from "lucide-react";
import { openCommandPalette } from "@/components/marketplace/command-palette";
import { POPULAR_SEARCHES } from "@/lib/data/marketplace-reference";

interface MarketplaceHeroPanelProps {
  onSearchSelect: (query: string) => void;
}

export function MarketplaceHeroPanel({ onSearchSelect }: MarketplaceHeroPanelProps) {
  return (
    <div className="flex flex-col justify-center pt-2 lg:pt-6">
      <h1 className="text-[32px] sm:text-[36px] lg:text-[40px] font-semibold tracking-[-0.03em] leading-[1.08] text-foreground text-balance">
        Own the{" "}
        <span className="text-accent">intelligence economy.</span>
      </h1>
      <p className="mt-4 text-[14px] sm:text-[15px] text-muted leading-relaxed max-w-[320px]">
        Discover, subscribe to, and use autonomous businesses that work for you 24/7.
      </p>

      <button
        type="button"
        onClick={openCommandPalette}
        className="mt-8 flex h-11 w-full max-w-[340px] items-center gap-3 rounded-full bg-surface px-4 text-left transition-colors hover:bg-[#161616]"
      >
        <Search className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
        <span className="flex-1 text-[14px] text-subtle">Search businesses...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-white/10 px-1.5 text-[11px] text-muted">
          ⌘K
        </kbd>
      </button>

      <div className="mt-5 flex flex-wrap gap-2">
        {POPULAR_SEARCHES.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => onSearchSelect(term)}
            className="rounded-full bg-surface px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-foreground"
          >
            {term}
          </button>
        ))}
      </div>
    </div>
  );
}
