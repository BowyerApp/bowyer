import { NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/wallet-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAgent, netDeposits } from "@/lib/trading/store";
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
