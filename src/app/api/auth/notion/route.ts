import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/oauth/crypto";
import { isOAuthConfigured } from "@/lib/oauth/providers";
import { createOAuthState, requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

/** Start Notion OAuth — ?wallet=0x…&returnTo=/launch */
export async function GET(req: Request) {
  const clientId = process.env.NOTION_CLIENT_ID?.trim();
  if (!clientId || !isOAuthConfigured("notion")) {
    return NextResponse.json(
      { ok: false, error: "Notion OAuth is not configured on this server." },
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
  const state = createOAuthState({ wallet, provider: "notion", returnTo });

  const redirectUri = `${siteUrl()}/api/auth/notion/callback`;
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
