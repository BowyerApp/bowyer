import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  createWalletNonce,
  createWalletSession,
  getSessionWallet,
  sessionCookie,
} from "@/lib/wallet-auth";
import { claimReferral, REF_COOKIE } from "@/lib/referrals";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("session") === "1") {
    return NextResponse.json({ ok: true, wallet: getSessionWallet(req) });
  }
  const wallet = new URL(req.url).searchParams.get("wallet")?.trim() ?? "";
  try {
    return NextResponse.json({ ok: true, ...createWalletNonce(wallet) });
  } catch {
    return NextResponse.json({ ok: false, error: "Valid wallet required" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  let body: { wallet?: string; nonce?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const token = await createWalletSession({
    wallet: String(body.wallet ?? ""),
    nonce: String(body.nonce ?? ""),
    signature: String(body.signature ?? ""),
  });
  if (!token) {
    return NextResponse.json({ ok: false, error: "Wallet signature could not be verified" }, { status: 401 });
  }

  // Referral attribution: first signed session from a referred browser
  // credits the referrer. Idempotent and self-referral-safe.
  const refCode = req.headers
    .get("cookie")
    ?.match(new RegExp(`${REF_COOKIE}=([0-9a-f]{6,12})`))?.[1];
  if (refCode) {
    try {
      claimReferral(String(body.wallet ?? ""), refCode);
    } catch {
      // Attribution must never block sign-in.
    }
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
