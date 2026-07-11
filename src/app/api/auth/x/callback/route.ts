import { verifyOAuthState, siteUrl } from "@/lib/oauth/crypto";
import { oauthRedirectError, oauthRedirectSuccess } from "@/lib/oauth/redirect";
import { saveConnection } from "@/lib/oauth/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return oauthRedirectError("/portfolio", "x_not_configured");
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateToken = searchParams.get("state");
  if (!code || !stateToken) {
    return oauthRedirectError("/portfolio", "missing_code");
  }

  const state = verifyOAuthState<{
    wallet: string;
    provider: string;
    returnTo: string;
    code_verifier: string;
  }>(stateToken);
  if (!state || state.provider !== "x" || !state.code_verifier) {
    return oauthRedirectError(state?.returnTo ?? "/portfolio", "invalid_state");
  }

  const redirectUri = `${siteUrl()}/api/auth/x/callback`;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: state.code_verifier,
  });

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
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

  const userRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userJson = (await userRes.json()) as {
    data?: { id?: string; username?: string; name?: string };
  };
  if (!userJson.data?.id) {
    return oauthRedirectError(state.returnTo, "user_fetch");
  }

  saveConnection({
    wallet: state.wallet,
    provider: "x",
    providerUserId: userJson.data.id,
    providerUsername: userJson.data.username,
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    metadata: { name: userJson.data.name },
  });

  return oauthRedirectSuccess(state.returnTo, "x");
}
