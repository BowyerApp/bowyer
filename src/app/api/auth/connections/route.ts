import { NextResponse } from "next/server";
import {
  deleteConnection,
  listConnections,
  type OAuthProvider,
} from "@/lib/oauth/store";
import { configuredProviders } from "@/lib/oauth/providers";
import { requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

const PROVIDERS: OAuthProvider[] = ["github", "telegram", "notion", "discord", "x"];

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet")?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "wallet required" }, { status: 400 });
  }
  if (!requireWalletSession(req, wallet)) {
    return NextResponse.json({ ok: false, error: "Wallet authentication required" }, { status: 401 });
  }

  const connections = listConnections(wallet);
  const configured = configuredProviders();

  return NextResponse.json({ ok: true, connections, configured });
}

export async function DELETE(req: Request) {
  let body: { wallet?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const wallet = String(body.wallet ?? "").trim();
  const provider = String(body.provider ?? "") as OAuthProvider;
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "wallet required" }, { status: 400 });
  }
  if (!requireWalletSession(req, wallet)) {
    return NextResponse.json({ ok: false, error: "Wallet authentication required" }, { status: 401 });
  }
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ ok: false, error: "invalid provider" }, { status: 400 });
  }

  const ok = deleteConnection(wallet, provider);
  return NextResponse.json({ ok });
}
