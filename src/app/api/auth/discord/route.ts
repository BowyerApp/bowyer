import { NextResponse } from "next/server";
import { signOAuthState, siteUrl } from "@/lib/oauth/crypto";
import { isOAuthConfigured } from "@/lib/oauth/providers";

export const runtime = "nodejs";

/** Start Discord OAuth — ?wallet=0x…&returnTo=/launch */
export async function GET(req: Request) {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId || !isOAuthConfigured("discord")) {
    return NextResponse.json(
      { ok: false, error: "Discord OAuth is not configured on this server." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.trim() ?? "";
  const returnTo = searchParams.get("returnTo")?.trim() || "/portfolio";

  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "Connect your wallet first." }, { status: 400 });
  }

  const state = signOAuthState({
    wallet: wallet.toLowerCase(),
    provider: "discord",
    returnTo,
    ts: String(Date.now()),
  });

  const redirectUri = `${siteUrl()}/api/auth/discord/callback`;
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify guilds");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
