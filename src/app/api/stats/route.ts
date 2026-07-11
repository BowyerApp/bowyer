import { NextResponse } from "next/server";
import { getPlatformStats, getRecentEvents } from "@/lib/data/real-stats";
import { db } from "@/lib/db";
import { telegramConfigured } from "@/lib/telegram";
import { webSearchAvailable } from "@/lib/web-search";
import { llmAvailable } from "@/lib/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public live-proof stats — every number from the database or env, nothing fabricated. */
export async function GET() {
  const stats = getPlatformStats();
  const events = getRecentEvents(8);

  let reportsToday = 0;
  let telegramFollows = 0;
  let scheduledBusinesses = 0;
  try {
    reportsToday = (
      db()
        .prepare("SELECT COUNT(*) AS n FROM reports WHERE created_at >= date('now')")
        .get() as { n: number }
    ).n;
    telegramFollows = (
      db().prepare("SELECT COUNT(*) AS n FROM telegram_follows").get() as { n: number }
    ).n;
    scheduledBusinesses = (
      db().prepare("SELECT COUNT(*) AS n FROM schedules WHERE enabled = 1").get() as { n: number }
    ).n;
  } catch {
    // honest zeros
  }

  return NextResponse.json({
    network: process.env.NEXT_PUBLIC_BOWYER_NETWORK ?? "testnet",
    chainId: process.env.NEXT_PUBLIC_BOWYER_NETWORK === "mainnet" ? 4663 : 46630,
    ...stats,
    reportsToday,
    telegramFollows,
    scheduledBusinesses,
    capabilities: {
      llm: llmAvailable(),
      webSearch: webSearchAvailable(),
      telegram: telegramConfigured(),
      scheduler: process.env.DISABLE_SCHEDULER !== "1",
    },
    recentEvents: events,
    at: new Date().toISOString(),
  });
}
