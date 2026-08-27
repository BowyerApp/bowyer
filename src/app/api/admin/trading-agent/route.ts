import { NextResponse } from "next/server";
import {
  STRATEGY_META,
  createAgentInstance,
  listAgentsFor,
  type StrategyId,
} from "@/lib/trading/store";
import { ensureAgentWallet, liveTradingEnabled } from "@/lib/trading/wallets";

export const runtime = "nodejs";

/**
 * Ops endpoint (CRON_SECRET) to provision trading agents for a given owner
 * without a browser wallet session. Same guarantees as the public API: the
 * owner address recorded at creation is the only withdrawal target, ever.
 */

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    owner?: string;
    strategy?: string;
    mode?: string;
    brief?: string;
    sources?: { type: string; url: string }[];
    venue?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const owner = String(body.owner ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner)) {
    return NextResponse.json({ ok: false, error: "owner must be a 0x address" }, { status: 400 });
  }
  const strategy = String(body.strategy ?? "signal-analyst") as StrategyId;
  if (!(strategy in STRATEGY_META)) {
    return NextResponse.json({ ok: false, error: "Unknown strategy" }, { status: 400 });
  }
  const mode = body.mode === "live" ? "live" : "paper";
  if (mode === "live" && !liveTradingEnabled()) {
    return NextResponse.json({ ok: false, error: "Live trading not enabled" }, { status: 400 });
  }

  const config =
    strategy === "signal-analyst"
      ? {
          brief: String(body.brief ?? "").slice(0, 600) || undefined,
          sources: Array.isArray(body.sources) && body.sources.length > 0 ? body.sources : undefined,
          venue: body.venue === "hyperliquid" ? ("hyperliquid" as const) : undefined,
        }
      : undefined;

  const agent = createAgentInstance({ owner, strategy, mode, config });
  let walletAddress: string | null = null;
  if (mode === "live") {
    walletAddress = ensureAgentWallet(agent.id, owner);
    const { db } = await import("@/lib/db");
    db().prepare("UPDATE trading_agents SET wallet_address = ? WHERE id = ?").run(walletAddress, agent.id);
  }

  return NextResponse.json({ ok: true, agentId: agent.id, owner, strategy, mode, walletAddress });
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const owner = new URL(req.url).searchParams.get("owner")?.toLowerCase() ?? "";
  if (!/^0x[0-9a-f]{40}$/.test(owner)) {
    return NextResponse.json({ ok: false, error: "owner must be a 0x address" }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    agents: listAgentsFor(owner).map((a) => ({
      id: a.id,
      strategy: a.strategy,
      mode: a.mode,
      status: a.status,
      venue: a.config?.venue ?? "rhc",
      walletAddress: a.walletAddress,
      createdAt: a.createdAt,
    })),
  });
}
