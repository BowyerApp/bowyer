import { db } from "@/lib/db";
import { listAgents } from "@/lib/data/agents";

/**
 * Real platform statistics — every number here comes from the database or
 * the actual catalog. No fabricated scale.
 */

export interface PlatformStats {
  businessesLive: number;
  reportsPublished: number;
  activeSubscriptions: number;
  openSource: number;
}

export function getPlatformStats(): PlatformStats {
  const agents = listAgents();
  let reportsPublished = 0;
  let activeSubscriptions = 0;
  try {
    reportsPublished = (
      db().prepare("SELECT COUNT(*) AS n FROM reports").get() as { n: number }
    ).n;
    activeSubscriptions = (
      db()
        .prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE active = 1")
        .get() as { n: number }
    ).n;
  } catch {
    // DB unavailable (client render) — zeros are still honest.
  }

  return {
    businessesLive: agents.length,
    reportsPublished,
    activeSubscriptions,
    openSource: agents.filter((a) => a.pricing.model === "free").length,
  };
}

export interface BusinessStats {
  subscribers: number;
  reports: number;
  reportsToday: number;
  lastReportAt: string | null;
  /** Average confidence across published reports, 0-1, or null when no reports. */
  avgConfidence: number | null;
}

/** Real per-business stats from the database. */
export function getBusinessStats(slug: string): BusinessStats {
  try {
    const subscribers = (
      db()
        .prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE slug = ? AND active = 1")
        .get(slug) as { n: number }
    ).n;
    const reports = (
      db().prepare("SELECT COUNT(*) AS n FROM reports WHERE slug = ?").get(slug) as {
        n: number;
      }
    ).n;
    const reportsToday = (
      db()
        .prepare(
          "SELECT COUNT(*) AS n FROM reports WHERE slug = ? AND created_at >= date('now')"
        )
        .get(slug) as { n: number }
    ).n;
    const last = db()
      .prepare(
        "SELECT created_at FROM reports WHERE slug = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(slug) as { created_at: string } | undefined;
    const conf = db()
      .prepare(
        "SELECT AVG(confidence) AS c FROM reports WHERE slug = ? AND confidence IS NOT NULL"
      )
      .get(slug) as { c: number | null };
    return {
      subscribers,
      reports,
      reportsToday,
      lastReportAt: last?.created_at ?? null,
      avgConfidence: conf.c,
    };
  } catch {
    return {
      subscribers: 0,
      reports: 0,
      reportsToday: 0,
      lastReportAt: null,
      avgConfidence: null,
    };
  }
}

export interface PlatformEvent {
  business: string;
  slug: string;
  action: string;
  at: string;
}

/** Real recent activity: published reports and new subscriptions.
 * Unlisted businesses are excluded — their output shouldn't headline the feed. */
export function getRecentEvents(limit = 8): PlatformEvent[] {
  try {
    const reports = db()
      .prepare(
        `SELECT slug, title, created_at FROM reports
         WHERE slug NOT IN (SELECT slug FROM agents WHERE listed = 0)
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit) as { slug: string; title: string; created_at: string }[];
    const subs = db()
      .prepare(
        `SELECT slug, at FROM subscriptions
         WHERE active = 1 AND slug NOT IN (SELECT slug FROM agents WHERE listed = 0)
         ORDER BY at DESC LIMIT ?`
      )
      .all(limit) as { slug: string; at: string }[];

    const events: PlatformEvent[] = [
      ...reports.map((r) => ({
        business: r.slug,
        slug: r.slug,
        action: `published “${r.title.length > 60 ? `${r.title.slice(0, 60)}…` : r.title}”`,
        at: r.created_at,
      })),
      ...subs.map((s) => ({
        business: s.slug,
        slug: s.slug,
        action: "gained a subscriber",
        at: s.at,
      })),
    ];
    return events
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, limit);
  } catch {
    return [];
  }
}
