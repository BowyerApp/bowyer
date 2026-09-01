import { NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/wallet-auth";
import { rateLimit } from "@/lib/rate-limit";
import { fillsFor, getAgent, netDeposits, recordDeposit } from "@/lib/trading/store";
import { syncDeposits } from "@/lib/trading/deposits";
import { USDG, USDG_DEC, erc20Balance, nativeBalance } from "@/lib/trading/dex";

export const runtime = "nodejs";

/** Re-scan the chain for deposits into a live agent wallet. */
export async function POST(req: Request) {
  const limit = rateLimit(req, "trading-deposit", 20, 60_000);
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
  if (agent.mode !== "live" || !agent.walletAddress) {
    return NextResponse.json({ ok: false, error: "Paper agents need no deposits" }, { status: 400 });
  }

  // fomo (Solana) agents: deposits are plain USDC transfers, so reconcile the
  // on-chain balance against our fill ledger and book any unexplained inflow
  // as a deposit. expectedCash = deposits − buys + sells.
  if (agent.config?.venue === "fomo") {
    try {
      const { splBalance, USDC_MINT } = await import("@/lib/trading/fomo-solana");
      const usdc = await splBalance(agent.walletAddress, USDC_MINT);
      const fills = fillsFor(agent.id, 2000);
      const flow = fills.reduce((n, f) => n + (f.side === "buy" ? -f.valueUsd : f.valueUsd), 0);
      const expectedCash = netDeposits(agent.id) + flow;
      const delta = usdc - expectedCash;
      if (delta > 0.5) recordDeposit(agent.id, "deposit", delta);
      return NextResponse.json({
        ok: true,
        walletAddress: agent.walletAddress,
        usdcBalance: usdc,
        netDepositsUsd: netDeposits(agent.id),
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: "Solana RPC unreachable right now — deposits are safe on-chain, retry shortly." },
        { status: 502 }
      );
    }
  }

  await syncDeposits(agent.id).catch(() => 0);
  let usdg: bigint, eth: bigint;
  try {
    [usdg, eth] = await Promise.all([
      erc20Balance(USDG, agent.walletAddress),
      nativeBalance(agent.walletAddress),
    ]);
  } catch {
    return NextResponse.json(
      { ok: false, error: "RPC providers are unreachable right now — balances will refresh once the chain endpoint recovers. Deposits are safe on-chain." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    walletAddress: agent.walletAddress,
    usdgBalance: Number(usdg) / 10 ** USDG_DEC,
    ethBalance: Number(eth) / 1e18,
    netDepositsUsd: netDeposits(agent.id),
  });
}
