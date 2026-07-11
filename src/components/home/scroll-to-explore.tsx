"use client";

import { useCallback, useEffect, useState } from "react";
import { Mouse } from "lucide-react";
import { cn } from "@/lib/utils";

/** Scroll-to-market control — pattern from skills-marketplace section anchors + cmdk navigation UX */
export function ScrollToExplore() {
  const [atMarket, setAtMarket] = useState(false);

  useEffect(() => {
    const target = document.getElementById("market");
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => setAtMarket(entry.isIntersecting),
      { root: null, rootMargin: "-20% 0px -40% 0px", threshold: 0.05 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const scrollToMarket = useCallback(() => {
    document.getElementById("market")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <button
      type="button"
      onClick={scrollToMarket}
      aria-label="Scroll to explore the live market"
      className={cn(
        "inline-flex items-center gap-2 transition-all duration-300 hover:text-white/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D7FF00]/40 rounded-sm",
        atMarket ? "opacity-0 pointer-events-none translate-y-1" : "opacity-100"
      )}
    >
      <Mouse className="size-3.5 animate-bounce" style={{ animationDuration: "2s" }} />
      Scroll to explore
    </button>
  );
}
