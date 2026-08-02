/**
 * Wallet-level referral program for the V2 terminal.
 *
 * Every wallet gets a stable short code; sharing bowyer.app/r/<code> sets a
 * 30-day attribution cookie. The first time a referred wallet creates a
 * signed session, the claim is recorded. "Active" referrals are wallets
 * that went on to hold at least one live subscription.
 *
 * Rewards accrue against the V2 fee switch — tracking is live now, payouts
 * activate when protocol fees start flowing. No earnings are invented here.
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db";

export const REF_COOKIE = "bowyer_ref";
export const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Rev-share program tiers (share of referred trading fees at the fee switch). */
export const REF_TIERS = [
  { id: "R1", name: "Ronin", minActive: 0, sharePct: 25 },
  { id: "R2", name: "Samurai", minActive: 10, sharePct: 30 },
  { id: "R3", name: "Daimyo", minActive: 50, sharePct: 35 },
  { id: "R4", name: "Shogun", minActive: 200, sharePct: 40 },
] as const;

function ensureTables() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS wallet_referral_codes (
      code TEXT PRIMARY KEY,
      wallet TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wallet_referral_claims (
      referred_wallet TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      referrer_wallet TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ref_claims_referrer
      ON wallet_referral_claims (referrer_wallet, at DESC);
  `);
}

function codeFromWallet(wallet: string): string {
  return createHash("sha256").update(`bowyer-ref:${wallet.toLowerCase()}`).digest("hex").slice(0, 8);
}

/** Stable referral code for a wallet (created on first request). */
export function referralCodeFor(wallet: string): string {
  ensureTables();
  const w = wallet.toLowerCase();
  const code = codeFromWallet(w);
  db()
    .prepare("INSERT OR IGNORE INTO wallet_referral_codes (code, wallet) VALUES (?, ?)")
    .run(code, w);
  return code;
}

export function walletForCode(code: string): string | null {
  ensureTables();
  const row = db()
    .prepare("SELECT wallet FROM wallet_referral_codes WHERE code = ?")
    .get(code.toLowerCase()) as { wallet: string } | undefined;
  return row?.wallet ?? null;
}

/**
 * Record a referral claim for a newly signed-in wallet. Idempotent; ignores
 * self-referrals and unknown codes.
 */
export function claimReferral(referredWallet: string, code: string): boolean {
  ensureTables();
  const referred = referredWallet.toLowerCase();
  const referrer = walletForCode(code);
  if (!referrer || referrer === referred) return false;
  const existing = db()
    .prepare("SELECT 1 FROM wallet_referral_claims WHERE referred_wallet = ?")
    .get(referred);
  if (existing) return false;
  db()
    .prepare(
      "INSERT INTO wallet_referral_claims (referred_wallet, code, referrer_wallet) VALUES (?, ?, ?)"
    )
    .run(referred, code.toLowerCase(), referrer);
  return true;
}

export interface ReferralRow {
  wallet: string;
  at: string;
  active: boolean;
}

export interface ReferralStats {
  code: string;
  total: number;
  active: number;
  tier: (typeof REF_TIERS)[number];
  nextTier: (typeof REF_TIERS)[number] | null;
  referrals: ReferralRow[];
}

export function referralStats(wallet: string): ReferralStats {
  ensureTables();
  const w = wallet.toLowerCase();
  const code = referralCodeFor(w);
  const rows = db()
    .prepare(
      `SELECT c.referred_wallet AS wallet, c.at,
              EXISTS(
                SELECT 1 FROM subscriptions s
                WHERE s.subscriber = c.referred_wallet AND s.active = 1
              ) AS active
       FROM wallet_referral_claims c
       WHERE c.referrer_wallet = ?
       ORDER BY c.at DESC
       LIMIT 100`
    )
    .all(w) as { wallet: string; at: string; active: number }[];

  const referrals = rows.map((r) => ({ wallet: r.wallet, at: r.at, active: r.active === 1 }));
  const active = referrals.filter((r) => r.active).length;
  let tier: (typeof REF_TIERS)[number] = REF_TIERS[0];
  for (const t of REF_TIERS) if (active >= t.minActive) tier = t;
  const nextTier = REF_TIERS.find((t) => t.minActive > active) ?? null;

  return { code, total: referrals.length, active, tier, nextTier, referrals };
}
