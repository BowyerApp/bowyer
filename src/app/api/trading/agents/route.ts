import { NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/wallet-auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  PAPER_START_USD,
  STRATEGY_DEFAULTS,
  STRATEGY_META,
  briefError,
  createAgentInstance,
  decisionsFor,
  deleteAgent,
  equitySeries,
  fillsFor,
  getAgent,
  listAgentsFor,
  memoriesFor,
  netDeposits,
  positionsFor,
  cashFor,
  setAgentStatus,
  strategyStats,
  type StrategyId,
} from "@/lib/trading/store";
import { ensureAgentWallet, liveTradingEnabled } from "@/lib/trading/wallets";

export const runtime = "nodejs";

const VALID_STRATEGIES = Object.keys(STRATEGY_DEFAULTS) as StrategyId[];

function agentPayload(id: string) {
  const agent = getAgent(id);
  if (!agent) return null;
  const series = equitySeries(agent.id, 120);
  const equity = series.length ? series[series.length - 1].equityUsd : agent.mode === "paper" ? cashFor(agent.id) : 0;
  const start = agent.mode === "paper" ? PAPER_START_USD : Math.max(netDeposits(agent.id), 0.01);
  return {
    id: agent.id,
    strategy: agent.strategy,
    meta: STRATEGY_META[agent.strategy],
    mode: agent.mode,
    status: agent.status,
    config: agent.config,
    walletAddress: agent.walletAddress,
    createdAt: agent.createdAt,
    lastTickAt: agent.lastTickAt,
    lastNote: agent.lastNote,
    equityUsd: equity,
    startUsd: start,
    pnlPct: series.length && start > 0 ? ((equity - start) / start) * 100 : 0,
    positions: positionsFor(agent.id),
    fills: fillsFor(agent.id, 25),
    equitySeries: series,
    decisions: decisionsFor(agent.id, 10),
    memories: memoriesFor(agent.id, 8),
  };
}

export async function GET(req: Request) {
  const limit = rateLimit(req, "trading-agents", 60, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  const wallet = getSessionWallet(req);
  if (!wallet) return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });

  const agents = listAgentsFor(wallet).map((a) => agentPayload(a.id));
  return NextResponse.json({
    ok: true,
    agents,
    liveEnabled: liveTradingEnabled(),
    stats: strategyStats(),
    catalog: VALID_STRATEGIES.map((id) => ({ id, ...STRATEGY_META[id], defaults: STRATEGY_DEFAULTS[id] })),
  });
}

export async function POST(req: Request) {
  const limit = rateLimit(req, "trading-create", 10, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  const wallet = getSessionWallet(req);
  if (!wallet) return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });

  let body: {
    strategy?: string;
    mode?: string;
    brief?: string;
    sources?: { type?: string; url?: string }[];
    venue?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const strategy = String(body.strategy ?? "") as StrategyId;
  const mode = body.mode === "live" ? "live" : "paper";
  if (!VALID_STRATEGIES.includes(strategy)) {
    return NextResponse.json({ ok: false, error: "Unknown strategy" }, { status: 400 });
  }
  if (mode === "live" && !liveTradingEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Live trading is not enabled on this server yet — run it in simulation" },
      { status: 400 }
    );
  }

  // signal-analyst carries a mandate + knowledge sources in its config.
  let config:
    | { brief?: string; sources?: { type: string; url: string }[]; venue?: "rhc" | "hyperliquid" }
    | undefined;
  if (strategy === "signal-analyst") {
    const { isValidSourceUrl, isSafePublicHttpUrl, SUPPORTED_SOURCE_TYPES } = await import(
      "@/lib/knowledge-sources"
    );
    // OAuth-bound types are keyed to business agents, not trading instances.
    const allowed = (SUPPORTED_SOURCE_TYPES as readonly string[]).filter(
      (t) => !["notion", "x"].includes(t)
    );
    const requested = Array.isArray(body.sources)
      ? body.sources
          .map((s) => ({ type: String(s?.type ?? ""), url: String(s?.url ?? "").trim() }))
          .filter((s) => allowed.includes(s.type) && isValidSourceUrl(s.url))
          .slice(0, 4)
      : [];
    const sources: { type: string; url: string }[] = [];
    for (const s of requested) {
      const isHttp = ["website", "rss", "github", "pdf", "api"].includes(s.type);
      if (isHttp && !(await isSafePublicHttpUrl(s.url))) continue;
      sources.push(s);
    }
    config = {
      brief: String(body.brief ?? "").slice(0, 600) || undefined,
      sources: sources.length > 0 ? sources : undefined,
      venue: body.venue === "hyperliquid" ? "hyperliquid" : undefined,
    };
  }

  try {
    const agent = createAgentInstance({ owner: wallet, strategy, mode, config });
    if (mode === "live") {
      const address = ensureAgentWallet(agent.id, wallet);
      const { db } = await import("@/lib/db");
      db().prepare("UPDATE trading_agents SET wallet_address = ? WHERE id = ?").run(address, agent.id);
    }
    return NextResponse.json({ ok: true, agent: agentPayload(agent.id) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: briefError(err) }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const limit = rateLimit(req, "trading-patch", 30, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  const wallet = getSessionWallet(req);
  if (!wallet) return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });

  let body: { id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const agent = getAgent(String(body.id ?? ""));
  if (!agent || agent.owner !== wallet.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "Not your agent" }, { status: 404 });
  }
  if (body.action === "pause") setAgentStatus(agent.id, "paused");
  else if (body.action === "resume") setAgentStatus(agent.id, "active");
  else return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });

  return NextResponse.json({ ok: true, agent: agentPayload(agent.id) });
}

export async function DELETE(req: Request) {
  const limit = rateLimit(req, "trading-delete", 10, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  const wallet = getSessionWallet(req);
  if (!wallet) return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const agent = getAgent(String(body.id ?? ""));
  if (!agent || agent.owner !== wallet.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "Not your agent" }, { status: 404 });
  }
  if (agent.mode === "live" && agent.walletAddress) {
    // Refuse to delete while real funds are still in the agent wallet.
    const { erc20Balance, nativeBalance, USDG, WETH } = await import("@/lib/trading/dex");
    const [usdg, weth, eth] = await Promise.all([
      erc20Balance(USDG, agent.walletAddress),
      erc20Balance(WETH, agent.walletAddress),
      nativeBalance(agent.walletAddress),
    ]);
    if (usdg > BigInt(1e6) || weth > BigInt(1e15) || eth > BigInt(1e15)) {
      return NextResponse.json(
        { ok: false, error: "Withdraw funds before deleting a live agent" },
        { status: 400 }
      );
    }
  }
  deleteAgent(agent.id);
  return NextResponse.json({ ok: true });
}
