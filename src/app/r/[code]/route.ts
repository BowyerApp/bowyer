import { NextResponse } from "next/server";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, walletForCode } from "@/lib/referrals";

export const runtime = "nodejs";

/** Referral landing: remember who sent this browser, then go to the terminal. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const clean = code.trim().toLowerCase();
  const dest = new URL("/terminal", req.url);
  const res = NextResponse.redirect(dest);
  // Only set the cookie for codes that actually belong to a wallet.
  if (/^[0-9a-f]{6,12}$/.test(clean) && walletForCode(clean)) {
    res.cookies.set(REF_COOKIE, clean, {
      maxAge: REF_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}
