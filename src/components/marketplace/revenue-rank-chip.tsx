"use client";

import { useEffect, useState } from "react";

/** Module-level memo so a grid of cards costs one leaderboard fetch. */
let ranksPromise: Promise<Map<string, number>> | null = null;

function fetchRanks(): Promise<Map<string, number>> {
  ranksPromise ??= fetch("/api/leaderboard")
    .then((res) => (res.ok ? res.json() : { entries: [] }))
    .then((data: { entries: { slug: string; rank: number; revenueUsd: number }[] }) => {
      const map = new Map<string, number>();
      for (const entry of data.entries ?? []) {
        if (entry.revenueUsd > 0 && entry.rank <= 5) map.set(entry.slug, entry.rank);
      }
      return map;
    })
    .catch(() => new Map<string, number>());
  return ranksPromise;
}

/** "#N by revenue" chip for businesses in the on-chain top five. */
export function RevenueRankChip({ slug, className }: { slug: string; className?: string }) {
  const [rank, setRank] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRanks().then((ranks) => {
      if (!cancelled) setRank(ranks.get(slug) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (rank === null) return null;
  return (
    <span
      className={
        className ??
        "inline-flex w-fit items-center rounded-sm border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-medium text-foreground tabular-nums"
      }
    >
      #{rank} by revenue
    </span>
  );
}
