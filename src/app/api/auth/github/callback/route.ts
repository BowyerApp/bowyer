import { NextResponse } from "next/server";
import { verifyOAuthState, siteUrl } from "@/lib/oauth/crypto";
import { saveConnection } from "@/lib/oauth/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${siteUrl()}/portfolio?oauth=error&reason=github_not_configured`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateToken = searchParams.get("state");
  if (!code || !stateToken) {
    return NextResponse.redirect(`${siteUrl()}/portfolio?oauth=error&reason=missing_code`);
  }

  const state = verifyOAuthState<{
    wallet: string;
    provider: string;
    returnTo: string;
  }>(stateToken);
  if (!state || state.provider !== "github") {
    return NextResponse.redirect(`${siteUrl()}/portfolio?oauth=error&reason=invalid_state`);
  }

  const redirectUri = `${siteUrl()}/api/auth/github/callback`;
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${siteUrl()}${state.returnTo}?oauth=error&reason=token_exchange`);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenJson.access_token) {
    return NextResponse.redirect(`${siteUrl()}${state.returnTo}?oauth=error&reason=no_token`);
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bowyer-app",
    },
  });
  const user = (await userRes.json()) as { id?: number; login?: string };
  if (!user.id) {
    return NextResponse.redirect(`${siteUrl()}${state.returnTo}?oauth=error&reason=user_fetch`);
  }

  saveConnection({
    wallet: state.wallet,
    provider: "github",
    providerUserId: String(user.id),
    providerUsername: user.login,
    accessToken: tokenJson.access_token,
  });

  const dest = state.returnTo.includes("?")
    ? `${state.returnTo}&oauth=github_ok`
    : `${state.returnTo}?oauth=github_ok`;
  return NextResponse.redirect(`${siteUrl()}${dest}`);
}
