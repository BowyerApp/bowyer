import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator dashboard numbers — wallet connects, Telegram links, trading
 * agents, referrals. Secured with the same CRON_SECRET bearer token as the
 * cron endpoints; never exposed publicly.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is required" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const one = (sql: string): Record<string, number> => {
    try {
      return db().prepare(sql).get() as Record<string, number>;
    } catch {
      return {};
    }
  };

  const now = Date.now();
  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    wallets: {
      distinctEver: one("SELECT COUNT(DISTINCT wallet) AS n FROM wallet_sessions").n ?? 0,
      activeSessions: one(`SELECT COUNT(*) AS n FROM wallet_sessions WHERE expires_at > ${now}`).n ?? 0,
      activeWallets:
        one(`SELECT COUNT(DISTINCT wallet) AS n FROM wallet_sessions WHERE expires_at > ${now}`).n ?? 0,
    },
    telegram: {
      linkedChats: one("SELECT COUNT(*) AS n FROM telegram_links").n ?? 0,
    },
    trading: {
      agents: one("SELECT COUNT(*) AS n FROM trading_agents").n ?? 0,
      owners: one("SELECT COUNT(DISTINCT owner) AS n FROM trading_agents").n ?? 0,
      live: one("SELECT COUNT(*) AS n FROM trading_agents WHERE mode = 'live'").n ?? 0,
      fills: one("SELECT COUNT(*) AS n FROM trading_fills").n ?? 0,
    },
    referrals: {
      codes: one("SELECT COUNT(*) AS n FROM wallet_referral_codes").n ?? 0,
      claims: one("SELECT COUNT(*) AS n FROM wallet_referral_claims").n ?? 0,
    },
    subscriptions: {
      active: one("SELECT COUNT(*) AS n FROM subscriptions WHERE active = 1").n ?? 0,
    },
  });
}
