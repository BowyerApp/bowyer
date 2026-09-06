import { oauthRedirectError, oauthRedirectSuccess } from "@/lib/oauth/redirect";
import {
  callFirstAvailableRobinhoodTool,
  exchangeRobinhoodAuthorizationCode,
  invalidateRobinhoodMcpSession,
  listRobinhoodTools,
  unwrapRobinhoodToolResult,
} from "@/lib/robinhood-mcp-client";
import { replaceRobinhoodTokens, upsertRobinhoodConnection } from "@/lib/robinhood-trading";
import { consumeOAuthState } from "@/lib/wallet-auth";

export const runtime = "nodejs";

function firstAccountHint(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  for (const key of ["account_number", "accountNumber", "account_id", "accountId", "id"]) {
    if (typeof object[key] === "string" && object[key]) return String(object[key]).slice(-6);
  }
  for (const nested of Object.values(object)) {
    const result = Array.isArray(nested)
      ? nested.map(firstAccountHint).find(Boolean)
      : firstAccountHint(nested);
    if (result) return result;
  }
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (!stateToken) {
    return oauthRedirectError("/agents/robinhood-trading-agent#trading", oauthError ?? "missing_state");
  }
  const state = consumeOAuthState(stateToken, "robinhood");
  if (!state) return oauthRedirectError("/agents/robinhood-trading-agent#trading", "invalid_state");
  if (!code || oauthError) {
    return oauthRedirectError(state.returnTo, oauthError ?? "missing_code");
  }
  const verifier = state.payload.code_verifier;
  const clientId = state.payload.client_id;
  const redirectUri = state.payload.redirect_uri;
  if (!verifier || !clientId || !redirectUri) {
    return oauthRedirectError(state.returnTo, "invalid_pkce");
  }

  try {
    const token = await exchangeRobinhoodAuthorizationCode({
      code,
      verifier,
      clientId,
      redirectUri,
    });
    replaceRobinhoodTokens({
      wallet: state.wallet,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
      clientId,
      scope: token.scope ?? null,
    });
    invalidateRobinhoodMcpSession(state.wallet);

    try {
      const tools = await listRobinhoodTools(state.wallet);
      let accountHint: string | undefined;
      try {
        const account = await callFirstAvailableRobinhoodTool(state.wallet, [
          "get_accounts",
          "get_account",
          "get_portfolio",
        ]);
        accountHint = firstAccountHint(unwrapRobinhoodToolResult(account.result));
      } catch {}
      upsertRobinhoodConnection({
        wallet: state.wallet,
        status: "linked",
        agenticAccountHint: accountHint,
        lastVerifiedAt: new Date().toISOString(),
        lastError: null,
        metadata: {
          linkedVia: "robinhood-oauth-pkce",
          tools: tools.map((tool) => tool.name),
        },
      });
    } catch (error) {
      upsertRobinhoodConnection({
        wallet: state.wallet,
        status: "linked",
        lastError: error instanceof Error ? error.message.slice(0, 500) : "MCP verification failed",
      });
    }

    return oauthRedirectSuccess(state.returnTo, "robinhood");
  } catch {
    return oauthRedirectError(state.returnTo, "token_exchange");
  }
}
