import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  decisionsFor,
  equitySeries,
  fillsFor,
  listActiveAgents,
  netDeposits,
  pendingFomoTheses,
  positionsFor,
  thesesFor,
} from "@/lib/trading/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The public ledger — the whole desk, one request away, no login.
 *
 * A number you cannot re-derive is a rumor: every fill here carries the
 * transaction hash that proves it, every thesis links to the fill it
 * justified, and every decision was recorded the moment the model responded,
 * before execution. If something is stale, the `staleness` field says so
 * instead of dressing a frozen figure up as a live one.
 */

function txUrl(venue: string, txHash: string, symbol: string): string | null {
  if (!txHash || txHash === "paper") return null;
  if (txHash.startsWith("hl:")) return `https://app.hyperliquid.xyz/trade/${symbol}`;
  if (venue === "fomo") return `https://solscan.io/tx/${txHash}`;
  return `https://robinhoodchain.blockscout.com/tx/${txHash}`;
}

function walletUrl(wallet: string): string {
  return wallet.startsWith("0x")
    ? `https://robinhoodchain.blockscout.com/address/${wallet}`
    : `https://solscan.io/account/${wallet}`;
}

function ageMs(sqliteUtc: string | null): number | null {
  if (!sqliteUtc) return null;
  return Date.now() - new Date(`${sqliteUtc.replace(" ", "T")}Z`).getTime();
}

export async function GET(req: Request) {
  const limit = rateLimit(req, "desk-ledger", 60, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });

  const agents = listActiveAgents().filter((a) => a.mode === "live");

  const payload = agents.map((a) => {
    const venue = a.config?.venue ?? "rhc";
    const fills = fillsFor(a.id, 60).map((f) => ({
      at: f.at,
      side: f.side,
      symbol: f.symbol,
      qty: f.qty,
      priceUsd: f.priceUsd,
      valueUsd: f.valueUsd,
      reason: f.reason,
      txHash: f.txHash,
      proof: txUrl(venue, f.txHash, f.symbol),
    }));
    const theses = thesesFor(a.id, 40).map((t) => ({
      at: t.at,
      side: t.side,
      symbol: t.symbol,
      thesis: t.thesis,
      txHash: t.txHash,
      proof: t.txHash ? txUrl(venue, t.txHash, t.symbol) : null,
      postedToFomo: t.fomoPosted,
    }));
    const series = equitySeries(a.id, 200);
    const equityUsd = series.length ? series[series.length - 1].equityUsd : 0;
    const lastTickAge = ageMs(a.lastTickAt);

    return {
      agent: a.id.slice(0, 8),
      venue,
      wallet: a.walletAddress,
      walletProof: a.walletAddress ? walletUrl(a.walletAddress) : null,
      equityUsd,
      netDepositsUsd: netDeposits(a.id),
      positions: positionsFor(a.id).map((p) => ({
        symbol: p.symbol,
        qty: p.qty,
        avgCostUsd: p.avgCostUsd,
      })),
      fills,
      theses,
      decisions: decisionsFor(a.id, 20).map((d) => ({
        at: d.at,
        reasoning: d.reasoning,
        orders: d.orders,
      })),
      staleness:
        lastTickAge === null
          ? "never ticked"
          : lastTickAge > 5 * 60 * 1000
            ? `stale — last tick ${Math.round(lastTickAge / 60_000)}m ago`
            : "live",
    };
  });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    note: "Every fill carries its transaction hash. Re-derive everything; trust nothing.",
    fomoThesisQueue: pendingFomoTheses(50).length,
    agents: payload,
  });
}
