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
  if (body.action === "bridge") return bridgeToRhc(body);
  if (body.action === "sweep-usdg") return sweepUsdgHome(body);

  const owner = String(body.owner ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner)) {
    return NextResponse.json({ ok: false, error: "owner must be a 0x address" }, { status: 400 });
  }
  const strategy = String(body.strategy ?? "signal-analyst") as StrategyId;
  if (!(strategy in STRATEGY_META)) {
    return NextResponse.json({ ok: false, error: "Unknown strategy" }, { status: 400 });
  }
  const mode = body.mode === "live" ? "live" : "paper";
  const venue =
    body.venue === "hyperliquid"
      ? ("hyperliquid" as const)
      : body.venue === "fomo"
        ? ("fomo" as const)
        : undefined;

  const { fomoSolanaEnabled, fomoSolanaAddress, splBalance, USDC_MINT } = await import(
    "@/lib/trading/fomo-solana"
  );

  if (mode === "live" && venue === "fomo" && !fomoSolanaEnabled()) {
    return NextResponse.json({ ok: false, error: "FOMO_SOLANA_KEY not set" }, { status: 400 });
  }
  if (mode === "live" && venue !== "fomo" && !liveTradingEnabled()) {
    return NextResponse.json({ ok: false, error: "Live trading not enabled" }, { status: 400 });
  }

  const config =
    strategy === "signal-analyst"
      ? {
          brief: String(body.brief ?? "").slice(0, 600) || undefined,
          sources: Array.isArray(body.sources) && body.sources.length > 0 ? body.sources : undefined,
          venue,
        }
      : undefined;

  const agent = createAgentInstance({ owner, strategy, mode, config });
  let walletAddress: string | null = null;
  if (mode === "live" && venue === "fomo") {
    // fomo agents share the env-configured Solana wallet; no per-agent EOA.
    walletAddress = fomoSolanaAddress();
    const { db } = await import("@/lib/db");
    db().prepare("UPDATE trading_agents SET wallet_address = ? WHERE id = ?").run(walletAddress, agent.id);
    // Seed the PnL baseline with the wallet's current USDC so the leaderboard
    // reports real performance from the moment the bot takes over.
    if (walletAddress) {
      const { recordDeposit } = await import("@/lib/trading/store");
      const usdc = await splBalance(walletAddress, USDC_MINT).catch(() => 0);
      if (usdc > 0) recordDeposit(agent.id, "deposit", usdc);
    }
  } else if (mode === "live") {
    walletAddress = ensureAgentWallet(agent.id, owner);
    const { db } = await import("@/lib/db");
    db().prepare("UPDATE trading_agents SET wallet_address = ? WHERE id = ?").run(walletAddress, agent.id);
  }

  return NextResponse.json({ ok: true, agentId: agent.id, owner, strategy, mode, venue: venue ?? "rhc", walletAddress });
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

/**
 * Fund the Robinhood Chain side of a fomo agent's dual book: bridges USDC
 * from its Solana wallet to USDG (or gas ETH) in its own EVM wallet via
 * Relay. An internal rebalance between the agent's two wallets — never an
 * external transfer — so the deposit ledger is untouched.
 */
async function bridgeToRhc(body: { agentId?: string; usd?: unknown; receive?: unknown }) {
  const { getAgent, briefError } = await import("@/lib/trading/store");
  const agent = getAgent(String(body.agentId ?? ""));
  if (!agent || agent.mode !== "live" || agent.config?.venue !== "fomo") {
    return NextResponse.json({ ok: false, error: "Live fomo agent not found" }, { status: 404 });
  }
  const usd = Number(body.usd);
  if (!Number.isFinite(usd) || usd < 2 || usd > 2_000) {
    return NextResponse.json({ ok: false, error: "usd must be 2-2000" }, { status: 400 });
  }
  const receive = body.receive === "eth" ? ("eth" as const) : ("usdg" as const);

  const { loadAgentSolanaWallet } = await import("@/lib/trading/wallets");
  const { loadFomoSolanaWallet } = await import("@/lib/trading/fomo-solana");
  const sol = loadAgentSolanaWallet(agent.id) ?? loadFomoSolanaWallet();
  if (!sol) return NextResponse.json({ ok: false, error: "No Solana wallet for agent" }, { status: 500 });

  const recipient = ensureAgentWallet(agent.id, agent.owner);
  try {
    const { bridgeSolanaUsdcToRhc } = await import("@/lib/trading/relay-bridge");
    const r = await bridgeSolanaUsdcToRhc({
      signer: { secretKey: sol.secretKey, address: sol.address },
      recipient,
      usd,
      receive,
    });
    return NextResponse.json({ ok: true, recipient, receive, ...r });
  } catch (err) {
    return NextResponse.json({ ok: false, error: briefError(err), recipient }, { status: 500 });
  }
}

/**
 * Sweep any USDG sitting in a fomo agent's EVM wallet back to USDC on its
 * Solana balance via Relay — trading cash lives in ONE place (the fomo
 * balance); the EVM wallet keeps only custody of RHC positions and gas.
 */
async function sweepUsdgHome(body: { agentId?: string }) {
  const { getAgent, briefError } = await import("@/lib/trading/store");
  const agent = getAgent(String(body.agentId ?? ""));
  if (!agent || agent.mode !== "live" || agent.config?.venue !== "fomo") {
    return NextResponse.json({ ok: false, error: "Live fomo agent not found" }, { status: 404 });
  }
  const { loadAgentWallet, loadAgentSolanaWallet } = await import("@/lib/trading/wallets");
  const { fomoSolanaAddress } = await import("@/lib/trading/fomo-solana");
  const evm = loadAgentWallet(agent.id);
  if (!evm) return NextResponse.json({ ok: false, error: "No EVM wallet" }, { status: 404 });
  const solAddress = loadAgentSolanaWallet(agent.id)?.address ?? fomoSolanaAddress();
  if (!solAddress) return NextResponse.json({ ok: false, error: "No Solana wallet" }, { status: 404 });

  try {
    const dex = await import("@/lib/trading/dex");
    const bal = await dex.erc20Balance(dex.USDG, evm.address);
    if (bal <= BigInt(0)) return NextResponse.json({ ok: false, error: "No USDG to sweep" }, { status: 400 });
    const { relaySellRhcToken } = await import("@/lib/trading/relay-bridge");
    const r = await relaySellRhcToken({
      account: evm.account,
      token: dex.USDG,
      amountRaw: bal,
      solRecipient: solAddress,
    });
    return NextResponse.json({
      ok: true,
      sweptUsd: Number(bal) / 10 ** dex.USDG_DEC,
      receivedUsd: r.outUsd,
      txid: r.txid,
      to: solAddress,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: briefError(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);

  // Ops observability: recent decision trail for one agent (reasoning + context).
  const decisionsAgent = url.searchParams.get("decisions");
  if (decisionsAgent) {
    const { decisionsFor } = await import("@/lib/trading/store");
    return NextResponse.json({ ok: true, decisions: decisionsFor(decisionsAgent, 5) });
  }

  // Ops observability: raw position rows (qty, avg cost, high-water) for one agent.
  const positionsAgent = url.searchParams.get("positions");
  if (positionsAgent) {
    const { positionsFor, fillsFor } = await import("@/lib/trading/store");
    const { loadAgentWallet, loadAgentSolanaWallet } = await import("@/lib/trading/wallets");
    // Address only (never key material) — needed to audit RHC custody on-chain.
    const evmAddress = loadAgentWallet(positionsAgent)?.address ?? null;
    let evmGasEth: number | null = null;
    if (evmAddress) {
      try {
        const dex = await import("@/lib/trading/dex");
        evmGasEth = Number(await dex.nativeBalance(evmAddress)) / 1e18;
      } catch {
        /* observability only */
      }
    }
    return NextResponse.json({
      ok: true,
      evmAddress,
      evmGasEth,
      solAddress: loadAgentSolanaWallet(positionsAgent)?.address ?? null,
      positions: positionsFor(positionsAgent),
      recentFills: fillsFor(positionsAgent, 15),
    });
  }

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
