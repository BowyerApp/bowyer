import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { hlScreener } from "@/lib/trading/hyperliquid";

export const runtime = "nodejs";

/** Live Hyperliquid perp universe as seen by the trading agents. */
export async function GET(req: Request) {
  const limit = rateLimit(req, "trading-hl", 30, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  try {
    const tokens = await hlScreener(20);
    return NextResponse.json(
      {
        ok: true,
        venue: "hyperliquid",
        perps: tokens.map((t) => ({
          symbol: t.symbol,
          priceUsd: t.priceUsd,
          change24h: t.change24h,
          volume24hUsd: t.volume24h,
          openInterestUsd: t.liquidityUsd,
        })),
      },
      { headers: { "Cache-Control": "public, max-age=30" } }
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
