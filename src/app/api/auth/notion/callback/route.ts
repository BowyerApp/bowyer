import { siteUrl } from "@/lib/oauth/crypto";
import { oauthRedirectError, oauthRedirectSuccess } from "@/lib/oauth/redirect";
import { saveConnection } from "@/lib/oauth/store";
import { consumeOAuthState } from "@/lib/wallet-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const clientId = process.env.NOTION_CLIENT_ID?.trim();
  const clientSecret = process.env.NOTION_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return oauthRedirectError("/portfolio", "notion_not_configured");
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateToken = searchParams.get("state");
  if (!code || !stateToken) {
    return oauthRedirectError("/portfolio", "missing_code");
  }

  const state = consumeOAuthState(stateToken, "notion");
  if (!state) {
    return oauthRedirectError("/portfolio", "invalid_state");
  }

  const redirectUri = `${siteUrl()}/api/auth/notion/callback`;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return oauthRedirectError(state.returnTo, "token_exchange");
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    workspace_name?: string;
    workspace_id?: string;
    bot_id?: string;
    owner?: { user?: { id?: string; name?: string } };
  };
  if (!tokenJson.access_token) {
    return oauthRedirectError(state.returnTo, "no_token");
  }

  saveConnection({
    wallet: state.wallet,
    provider: "notion",
    providerUserId: tokenJson.owner?.user?.id ?? tokenJson.bot_id ?? "notion",
    providerUsername: tokenJson.owner?.user?.name ?? tokenJson.workspace_name,
    accessToken: tokenJson.access_token,
    metadata: {
      workspace_id: tokenJson.workspace_id,
      workspace_name: tokenJson.workspace_name,
    },
  });

  return oauthRedirectSuccess(state.returnTo, "notion");
}
