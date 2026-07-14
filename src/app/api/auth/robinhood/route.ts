import { NextResponse } from "next/server";
import {
  getRobinhoodConnection,
  ROBINHOOD_AGENTIC_URL,
  ROBINHOOD_MCP_DOCS,
  upsertRobinhoodConnection,
} from "@/lib/robinhood-trading";
import { ROBINHOOD_TRADING_MCP } from "@/lib/mcp";
import { requireWalletSession } from "@/lib/wallet-auth";
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

  let body: { action?: string; agenticAccountHint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "link") {
    const connection = upsertRobinhoodConnection({
      wallet,
      status: "linked",
      agenticAccountHint: body.agenticAccountHint?.trim(),
      metadata: { linkedVia: "bowyer-console", mcp: ROBINHOOD_TRADING_MCP },
    });
    return NextResponse.json({ ok: true, connection });
  }
  if (body.action === "pause") {
    const connection = upsertRobinhoodConnection({ wallet, status: "paused" });
    return NextResponse.json({ ok: true, connection });
  }
  if (body.action === "revoke") {
    const connection = upsertRobinhoodConnection({ wallet, status: "revoked" });
    return NextResponse.json({ ok: true, connection });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
