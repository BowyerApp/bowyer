import { NextResponse } from "next/server";
import { getCreatorDashboard } from "@/lib/creator-stats";
import { rateLimit } from "@/lib/rate-limit";
import { requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const limit = rateLimit(req, "creator-dash", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const dash = getCreatorDashboard(wallet);

  if (format === "csv") {
    return new NextResponse(dash.exportCsv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bowyer-earnings-${wallet.slice(0, 8)}.csv"`,
      },
    });
  }

  return NextResponse.json({ ok: true, dashboard: dash });
}
