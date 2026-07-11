import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/oauth/crypto";
import { createOAuthState, requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

/** Start GitHub OAuth — requires ?wallet=0x…&returnTo=/launch */
export async function GET(req: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "GitHub OAuth is not configured on this server." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.trim() ?? "";
  const returnTo = searchParams.get("returnTo")?.trim() || "/portfolio";

  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "Connect your wallet first." }, { status: 400 });
  }
  if (!requireWalletSession(req, wallet)) {
    return NextResponse.json({ ok: false, error: "Sign your wallet session first." }, { status: 401 });
  }
  if (!returnTo.startsWith("/")) {
    return NextResponse.json({ ok: false, error: "Invalid return path." }, { status: 400 });
  }
  const state = createOAuthState({ wallet, provider: "github", returnTo });

  const redirectUri = `${siteUrl()}/api/auth/github/callback`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user repo");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
