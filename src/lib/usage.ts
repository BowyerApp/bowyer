import { db } from "@/lib/db";

/**
 * Per-business daily API quotas — protects free tiers (Tavily, LLM) from
 * runaway scheduled + on-demand usage.
 */

export type UsageKind = "search" | "llm" | "scrape";
const PLATFORM_LLM_DAILY_LIMIT = Number(process.env.PLATFORM_DAILY_LLM_LIMIT ?? 2_000);
const PLATFORM_LLM_RPM = Number(process.env.PLATFORM_LLM_RPM ?? 20);
let minuteWindow = { startedAt: 0, count: 0 };

const DEFAULT_LIMITS: Record<UsageKind, number> = {
  search: Number(process.env.DAILY_SEARCH_LIMIT ?? 40),
  llm: Number(process.env.DAILY_LLM_LIMIT ?? 80),
  scrape: Number(process.env.DAILY_SCRAPE_LIMIT ?? 20),
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCount(slug: string, kind: UsageKind): number {
  try {
    const row = db()
      .prepare(
        "SELECT count FROM usage_daily WHERE slug = ? AND day = ? AND kind = ?"
      )
      .get(slug, today(), kind) as { count: number } | undefined;
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export function usageAllowed(slug: string, kind: UsageKind): boolean {
  return getCount(slug, kind) < DEFAULT_LIMITS[kind];
}

export function recordUsage(slug: string, kind: UsageKind, n = 1): void {
  try {
    db()
      .prepare(
        `INSERT INTO usage_daily (slug, day, kind, count)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(slug, day, kind) DO UPDATE SET count = count + ?`
      )
      .run(slug, today(), kind, n, n);
  } catch {
    // degrade silently
  }
}

/** Shared platform-model guardrail. BYOK calls are intentionally excluded. */
export function platformLlmAllowed(): boolean {
  const now = Date.now();
  if (now - minuteWindow.startedAt >= 60_000) minuteWindow = { startedAt: now, count: 0 };
  if (minuteWindow.count >= PLATFORM_LLM_RPM) return false;
  try {
    const row = db()
      .prepare("SELECT count FROM platform_usage_daily WHERE day = ? AND kind = 'llm'")
      .get(today()) as { count: number } | undefined;
    return (row?.count ?? 0) < PLATFORM_LLM_DAILY_LIMIT;
  } catch {
    return false;
  }
}

export function recordPlatformLlm(): void {
  const now = Date.now();
  if (now - minuteWindow.startedAt >= 60_000) minuteWindow = { startedAt: now, count: 0 };
  minuteWindow.count++;
  db()
    .prepare(
      `INSERT INTO platform_usage_daily (day, kind, count) VALUES (?, 'llm', 1)
       ON CONFLICT(day, kind) DO UPDATE SET count = count + 1`
    )
    .run(today());
}

export function getUsageSummary(slug: string): Record<UsageKind, { used: number; limit: number }> {
  return {
    search: { used: getCount(slug, "search"), limit: DEFAULT_LIMITS.search },
    llm: { used: getCount(slug, "llm"), limit: DEFAULT_LIMITS.llm },
    scrape: { used: getCount(slug, "scrape"), limit: DEFAULT_LIMITS.scrape },
  };
}
