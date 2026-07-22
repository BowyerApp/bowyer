import { NextResponse } from "next/server";
import { getStockTokenQuotes } from "@/lib/stock-tokens";
import { recordQuoteSnapshots } from "@/lib/desk-signals";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const limit = rateLimit(req, "desk-quotes", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const symbols = url.searchParams.get("symbols")?.split(",").map((s) => s.trim()).filter(Boolean);
  const quotes = await getStockTokenQuotes(symbols);
  try {
    recordQuoteSnapshots(quotes);
  } catch {
    /* history is best-effort */
  }
  return NextResponse.json({
    ok: true,
    product: "HOOD DESK",
    chainId: 4663,
    count: quotes.length,
    quotes,
  });
}
