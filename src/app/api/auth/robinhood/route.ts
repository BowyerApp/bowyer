import { NextResponse } from "next/server";
import {
  disconnectRobinhood,
  getRobinhoodConnection,
  getRobinhoodTokens,
  ROBINHOOD_AGENTIC_URL,
  ROBINHOOD_MCP_DOCS,
  upsertRobinhoodConnection,
} from "@/lib/robinhood-trading";
import { ROBINHOOD_TRADING_MCP } from "@/lib/mcp";
import { siteUrl } from "@/lib/oauth/crypto";
import {
  createRobinhoodPkce,
  getOrRegisterRobinhoodOAuthClient,
  getRobinhoodOAuthMetadata,
} from "@/lib/robinhood-mcp-client";
import { createOAuthState, requireWalletSession } from "@/lib/wallet-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }
  const connection = getRobinhoodConnection(wallet);
  return NextResponse.json({
    ok: true,
    connection,
    mcpEndpoint: ROBINHOOD_TRADING_MCP,
    agenticUrl: ROBINHOOD_AGENTIC_URL,
    docsUrl: ROBINHOOD_MCP_DOCS,
  });
}

export async function POST(req: Request) {
  const limit = rateLimit(req, "robinhood-connect", 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }

  let body: { action?: string; returnTo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "start" || body.action === "link") {
    const returnTo = body.returnTo?.trim() || "/agents/robinhood-trading-agent#trading";
    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
      return NextResponse.json({ ok: false, error: "Invalid return path" }, { status: 400 });
    }
    try {
      const redirectUri = `${siteUrl()}/api/auth/robinhood/callback`;
      const { clientId, metadata, resourceMetadata } =
        await getOrRegisterRobinhoodOAuthClient(redirectUri);
      const { verifier, challenge } = createRobinhoodPkce();
      const state = createOAuthState({
        wallet,
        provider: "robinhood",
        returnTo,
        payload: { code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri },
      });
      const authorizeUrl = new URL(metadata.authorization_endpoint);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("client_id", clientId);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("code_challenge", challenge);
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
      authorizeUrl.searchParams.set("resource", ROBINHOOD_TRADING_MCP);
      const configuredScopes = process.env.ROBINHOOD_OAUTH_SCOPES
        ?.split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean);
      const supported = new Set(metadata.scopes_supported ?? []);
      const requested = configuredScopes?.length
        ? configuredScopes
        : resourceMetadata.scopes_supported?.length
          ? resourceMetadata.scopes_supported
          : ["internal"];
      const scopes = requested.filter((scope) => supported.size === 0 || supported.has(scope));
      if (scopes?.length) authorizeUrl.searchParams.set("scope", scopes.join(" "));
      return NextResponse.json({ ok: true, authorizeUrl: authorizeUrl.toString() });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "OAuth setup failed" },
        { status: 502 }
      );
    }
  }
  if (body.action === "pause") {
    const connection = upsertRobinhoodConnection({ wallet, status: "paused" });
    return NextResponse.json({ ok: true, connection });
  }
  if (body.action === "resume") {
    if (!getRobinhoodTokens(wallet)) {
      return NextResponse.json({ ok: false, error: "Reconnect Robinhood first" }, { status: 409 });
    }
    const connection = upsertRobinhoodConnection({ wallet, status: "linked", lastError: null });
    return NextResponse.json({ ok: true, connection });
  }
  if (body.action === "revoke") {
    const tokens = getRobinhoodTokens(wallet);
    if (tokens) {
      try {
        const metadata = await getRobinhoodOAuthMetadata();
        if (metadata.revocation_endpoint) {
          await fetch(metadata.revocation_endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              token: tokens.refreshToken ?? tokens.accessToken,
              client_id: tokens.clientId ?? "",
            }),
            signal: AbortSignal.timeout(10_000),
          });
        }
      } catch {
        // Local revocation remains authoritative for BOWYER even if the provider is unreachable.
      }
    }
    const connection = disconnectRobinhood(wallet, true);
    return NextResponse.json({ ok: true, connection });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
