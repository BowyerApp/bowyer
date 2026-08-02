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
      total: one("SELECT COUNT(*) AS n FROM subscriptions").n ?? 0,
      distinctSubscribers: one("SELECT COUNT(DISTINCT subscriber) AS n FROM subscriptions").n ?? 0,
    },
    lifetime: {
      agentBusinessesCreated: one("SELECT COUNT(*) AS n FROM agents").n ?? 0,
      agentBusinessCreators:
        one(
          "SELECT COUNT(DISTINCT owner_address) AS n FROM agents WHERE owner_address IS NOT NULL AND owner_address != ''"
        ).n ?? 0,
      businessRegistryEntries: one("SELECT COUNT(*) AS n FROM business_registry").n ?? 0,
      x402Payments: one("SELECT COUNT(*) AS n FROM x402_payments").n ?? 0,
      x402Payers: one("SELECT COUNT(DISTINCT payer) AS n FROM x402_payments").n ?? 0,
      oauthConnections: one("SELECT COUNT(*) AS n FROM oauth_connections").n ?? 0,
      incubatorVotes: one("SELECT COUNT(*) AS n FROM incubator_votes").n ?? 0,
      reportsPublished: one("SELECT COUNT(*) AS n FROM reports").n ?? 0,
      /** Distinct wallets that appear in ANY engagement table. */
      walletsDidAnything:
        one(
          `SELECT COUNT(*) AS n FROM (
            SELECT DISTINCT LOWER(wallet) AS w FROM wallet_sessions
            UNION SELECT DISTINCT LOWER(subscriber) FROM subscriptions
            UNION SELECT DISTINCT LOWER(owner) FROM trading_agents
            UNION SELECT DISTINCT LOWER(wallet) FROM oauth_connections
            UNION SELECT DISTINCT LOWER(wallet) FROM telegram_links WHERE wallet IS NOT NULL AND wallet != ''
            UNION SELECT DISTINCT LOWER(payer) FROM x402_payments
            UNION SELECT DISTINCT LOWER(owner_address) FROM agents WHERE owner_address IS NOT NULL AND owner_address != ''
            UNION SELECT DISTINCT LOWER(creator_address) FROM business_registry WHERE creator_address IS NOT NULL AND creator_address != ''
            UNION SELECT DISTINCT LOWER(wallet) FROM incubator_votes
            UNION SELECT DISTINCT LOWER(wallet) FROM wallet_referral_codes
          )`
        ).n ?? 0,
    },
  });
}
