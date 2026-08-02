import { NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/wallet-auth";
import { referralStats, REF_TIERS } from "@/lib/referrals";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const limit = rateLimit(req, "affiliate", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }
  const stats = referralStats(wallet);
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    ...stats,
    link: `${origin.replace(/\/$/, "")}/r/${stats.code}`,
    tiers: REF_TIERS,
  });
}
