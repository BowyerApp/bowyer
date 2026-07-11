import { siteUrl } from "@/lib/oauth/crypto";

export function oauthRedirectSuccess(returnTo: string, provider: string): Response {
  const sep = returnTo.includes("?") ? "&" : "?";
  return Response.redirect(`${siteUrl()}${returnTo}${sep}oauth=${provider}_ok`);
}

export function oauthRedirectError(
  returnTo: string,
  reason: string,
  fallback = "/portfolio"
): Response {
  const dest = returnTo || fallback;
  const sep = dest.includes("?") ? "&" : "?";
  return Response.redirect(`${siteUrl()}${dest}${sep}oauth=error&reason=${reason}`);
}
