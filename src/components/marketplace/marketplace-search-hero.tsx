"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { EXAMPLE_SEARCHES } from "@/lib/data/marketplace-experience";
import { cn } from "@/lib/utils";

interface MarketplaceSearchHeroProps {
  query: string;
  onQueryChange: (q: string) => void;
  onExampleSelect: (q: string) => void;
}

export function MarketplaceSearchHero({
  query,
  onQueryChange,
  onExampleSelect,
}: MarketplaceSearchHeroProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="pt-20 pb-24 lg:pt-32 lg:pb-36">
      <h1 className="text-[32px] sm:text-[44px] lg:text-[56px] font-semibold tracking-[-0.03em] text-foreground leading-[1.08] max-w-3xl text-balance">
        What do you want an AI to do?
      </h1>

      <div className="mt-12 lg:mt-16 max-w-2xl">
        <div className="relative group">
          <Search
            className="absolute left-0 top-1/2 -translate-y-1/2 size-5 text-muted pointer-events-none"
            strokeWidth={1.5}
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search businesses…"
            className={cn(
              "w-full bg-transparent border-0 border-b border-border",
              "py-4 pl-8 pr-4 text-[20px] sm:text-[24px] lg:text-[28px] text-foreground",
              "placeholder:text-subtle focus:outline-none focus:border-accent transition-colors duration-200"
            )}
          />
          <span className="absolute right-0 top-1/2 -translate-y-1/2 hidden sm:inline meta-text font-mono">
            ⌘K
          </span>
        </div>
      </div>

      <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 max-w-3xl">
        {EXAMPLE_SEARCHES.map((example) => (
          <li key={example}>
            <button
              type="button"
              onClick={() => onExampleSelect(example)}
              className="text-[15px] text-muted hover:text-foreground transition-colors duration-150"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
