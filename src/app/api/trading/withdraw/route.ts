import { NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/wallet-auth";
import { rateLimit } from "@/lib/rate-limit";
import { briefError, getAgent, recordDeposit, setAgentStatus } from "@/lib/trading/store";
import { loadAgentWallet } from "@/lib/trading/wallets";
import {
  USDG,
  USDG_DEC,
  WETH,
  erc20Balance,
  ethUsdSpot,
  sweepEthToOwner,
  transferAllToOwner,
} from "@/lib/trading/dex";

export const runtime = "nodejs";

/**
 * Withdraw everything from a live agent wallet back to its owner.
 * The destination is the owner address recorded at creation — never a
 * request parameter. Open token positions are NOT force-sold here; the UI
 * tells users to pause + wait for exits, or accept leaving positions behind.
 */
export async function POST(req: Request) {
  const limit = rateLimit(req, "trading-withdraw", 6, 60_000);
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
  if (agent.mode !== "live") {
    return NextResponse.json({ ok: false, error: "Paper agents hold no funds" }, { status: 400 });
  }
  const agentWallet = loadAgentWallet(agent.id);
  if (!agentWallet) return NextResponse.json({ ok: false, error: "Agent wallet missing" }, { status: 500 });

  // Stop trading before moving funds.
  setAgentStatus(agent.id, "paused");

  try {
    const [usdgBal, wethBal, ethUsd] = await Promise.all([
      erc20Balance(USDG, agentWallet.address),
      erc20Balance(WETH, agentWallet.address),
      ethUsdSpot(),
    ]);

    const txs: string[] = [];
    const usdgTx = await transferAllToOwner(agentWallet.account, USDG, agentWallet.owner);
    if (usdgTx) txs.push(usdgTx);
    const wethTx = await transferAllToOwner(agentWallet.account, WETH, agentWallet.owner);
    if (wethTx) txs.push(wethTx);
    const ethTx = await sweepEthToOwner(agentWallet.account, agentWallet.owner);
    if (ethTx) txs.push(ethTx);

    const withdrawnUsd =
      Number(usdgBal) / 10 ** USDG_DEC + (Number(wethBal) / 1e18) * ethUsd;
    if (withdrawnUsd > 0) recordDeposit(agent.id, "withdraw", withdrawnUsd);

    return NextResponse.json({ ok: true, txs, withdrawnUsd });
  } catch (err) {
    return NextResponse.json({ ok: false, error: briefError(err) }, { status: 500 });
  }
}
