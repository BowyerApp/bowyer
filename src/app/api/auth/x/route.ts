import { NextResponse } from "next/server";
import { createPkcePair } from "@/lib/oauth/pkce";
import { signOAuthState, siteUrl } from "@/lib/oauth/crypto";
import { isOAuthConfigured } from "@/lib/oauth/providers";

export const runtime = "nodejs";

/** Start X OAuth 2.0 PKCE — ?wallet=0x…&returnTo=/launch */
export async function GET(req: Request) {
  const clientId = process.env.X_CLIENT_ID?.trim();
  if (!clientId || !isOAuthConfigured("x")) {
    return NextResponse.json(
      { ok: false, error: "X OAuth is not configured on this server." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.trim() ?? "";
  const returnTo = searchParams.get("returnTo")?.trim() || "/portfolio";

  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "Connect your wallet first." }, { status: 400 });
  }

  const { verifier, challenge } = createPkcePair();
  const state = signOAuthState({
    wallet: wallet.toLowerCase(),
    provider: "x",
    returnTo,
    ts: String(Date.now()),
    code_verifier: verifier,
  });

  const redirectUri = `${siteUrl()}/api/auth/x/callback`;
  const url = new URL("https://twitter.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "tweet.read users.read offline.access");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(url.toString());
}
