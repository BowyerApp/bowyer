import { siteUrl } from "@/lib/oauth/crypto";
import { oauthRedirectError, oauthRedirectSuccess } from "@/lib/oauth/redirect";
import { saveConnection } from "@/lib/oauth/store";
import { consumeOAuthState } from "@/lib/wallet-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return oauthRedirectError("/portfolio", "discord_not_configured");
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateToken = searchParams.get("state");
  if (!code || !stateToken) {
    return oauthRedirectError("/portfolio", "missing_code");
  }

  const state = consumeOAuthState(stateToken, "discord");
  if (!state) {
    return oauthRedirectError("/portfolio", "invalid_state");
  }

  const redirectUri = `${siteUrl()}/api/auth/discord/callback`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    return oauthRedirectError(state.returnTo, "token_exchange");
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!tokenJson.access_token) {
    return oauthRedirectError(state.returnTo, "no_token");
  }

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const user = (await userRes.json()) as { id?: string; username?: string; global_name?: string };
  if (!user.id) {
    return oauthRedirectError(state.returnTo, "user_fetch");
  }

  saveConnection({
    wallet: state.wallet,
    provider: "discord",
    providerUserId: user.id,
    providerUsername: user.global_name ?? user.username,
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
  });

  return oauthRedirectSuccess(state.returnTo, "discord");
}
