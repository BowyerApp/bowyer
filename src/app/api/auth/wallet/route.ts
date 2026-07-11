import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  createWalletNonce,
  createWalletSession,
  getSessionWallet,
  sessionCookie,
} from "@/lib/wallet-auth";

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

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
