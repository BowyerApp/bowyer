import { siteUrl } from "@/lib/oauth/crypto";

export function oauthRedirectSuccess(returnTo: string, provider: string): Response {
  const target = new URL(returnTo, siteUrl());
  target.searchParams.set("oauth", `${provider}_ok`);
  return Response.redirect(target);
}

export function oauthRedirectError(
  returnTo: string,
  reason: string,
  fallback = "/portfolio"
): Response {
  const dest = returnTo || fallback;
  const target = new URL(dest, siteUrl());
  target.searchParams.set("oauth", "error");
  target.searchParams.set("reason", reason);
  return Response.redirect(target);
}
