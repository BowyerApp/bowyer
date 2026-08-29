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
    action?: string;
    agentId?: string;
    to?: string;
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

  if (body.action === "transfer-out") return transferOut(body);

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

/**
 * Owner-requested transfer of a live agent's full balance to an external
 * address (e.g. a fomo deposit address). Pauses the agent, wraps spare
 * native ETH (minus a gas reserve), swaps WETH -> USDG, and sends all USDG
 * to the destination. CRON_SECRET-gated; used only at the platform owner's
 * explicit request since it bypasses the owner-only withdrawal rule.
 */
async function transferOut(body: { agentId?: string; to?: string }) {
  const to = String(body.to ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(to)) {
    return NextResponse.json({ ok: false, error: "to must be a 0x address" }, { status: 400 });
  }
  const { getAgent, recordDeposit, setAgentStatus, briefError } = await import("@/lib/trading/store");
  const { loadAgentWallet } = await import("@/lib/trading/wallets");
  const dex = await import("@/lib/trading/dex");

  const agent = getAgent(String(body.agentId ?? ""));
  if (!agent || agent.mode !== "live") {
    return NextResponse.json({ ok: false, error: "Live agent not found" }, { status: 404 });
  }
  const wallet = loadAgentWallet(agent.id);
  if (!wallet) return NextResponse.json({ ok: false, error: "Agent wallet missing" }, { status: 500 });

  setAgentStatus(agent.id, "paused");
  const txs: { step: string; hash: string }[] = [];
  const GAS_RESERVE = BigInt(5e15); // 0.005 ETH stays behind for gas

  try {
    const ethBal = await dex.nativeBalance(wallet.address);
    if (ethBal > GAS_RESERVE * BigInt(2)) {
      const wrapHash = await dex.wrapEth(wallet.account, ethBal - GAS_RESERVE);
      txs.push({ step: "wrap", hash: wrapHash });
    }
    const wethBal = await dex.erc20Balance(dex.WETH, wallet.address);
    if (wethBal > BigInt(0)) {
      const swap = await dex.swapV2Exact({
        account: wallet.account,
        tokenIn: dex.WETH,
        tokenOut: dex.USDG,
        amountIn: wethBal,
      });
      txs.push({ step: "swap", hash: swap.txHash });
    }
    const usdgBal = await dex.erc20Balance(dex.USDG, wallet.address);
    const sentUsd = Number(usdgBal) / 10 ** dex.USDG_DEC;
    const sendHash = await dex.transferAllToOwner(wallet.account, dex.USDG, to);
    if (sendHash) txs.push({ step: "send-usdg", hash: sendHash });
    if (sentUsd > 0) recordDeposit(agent.id, "withdraw", sentUsd);

    return NextResponse.json({ ok: true, to, sentUsd, txs });
  } catch (err) {
    return NextResponse.json({ ok: false, error: briefError(err), txs }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner")?.toLowerCase() ?? "";
  if (!/^0x[0-9a-f]{40}$/.test(owner)) {
    return NextResponse.json({ ok: false, error: "owner must be a 0x address" }, { status: 400 });
  }
  if (url.searchParams.get("sync") === "1") {
    const { syncDeposits } = await import("@/lib/trading/deposits");
    for (const a of listAgentsFor(owner)) {
      if (a.mode === "live" && a.walletAddress) await syncDeposits(a.id).catch(() => 0);
    }
  }
  const { netDeposits } = await import("@/lib/trading/store");
  return NextResponse.json({
    ok: true,
    agents: listAgentsFor(owner).map((a) => ({
      netDepositsUsd: netDeposits(a.id),
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
