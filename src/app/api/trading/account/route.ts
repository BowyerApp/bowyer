import { NextResponse } from "next/server";
import {
  callRobinhoodTool,
  findRobinhoodTool,
  listRobinhoodTools,
  unwrapRobinhoodToolResult,
} from "@/lib/robinhood-mcp-client";
import { getRobinhoodConnection } from "@/lib/robinhood-trading";
import { requireWalletSession } from "@/lib/wallet-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function findNumber(value: unknown, keys: string[]): number | null {
  if (!value || typeof value !== "object") return null;
  const normalized = new Set(keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "")));
  if (!Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (normalized.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
        const number = Number(nested);
        if (Number.isFinite(number)) return number;
      }
    }
  }
  for (const nested of Object.values(value)) {
    const found = findNumber(nested, keys);
    if (found !== null) return found;
  }
  return null;
}

export async function GET(req: Request) {
  const limit = rateLimit(req, "robinhood-account", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const wallet = requireWalletSession(req);
  if (!wallet) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }
  const connection = getRobinhoodConnection(wallet);
  if (connection.status !== "linked" && connection.status !== "paused") {
    return NextResponse.json({ ok: true, connection, account: null });
  }
  try {
    const tools = await listRobinhoodTools(wallet);
    const definitions = {
      portfolio: findRobinhoodTool(tools, ["get_portfolio", "get_account_summary", "get_account"]),
      positions: findRobinhoodTool(tools, ["get_positions", "get_open_positions", "list_positions"]),
      pnl: findRobinhoodTool(tools, ["get_profit_and_loss", "get_account_pnl", "get_realized_pnl"]),
    };
    const [portfolio, positions, pnl] = await Promise.all([
      definitions.portfolio
        ? callRobinhoodTool(wallet, definitions.portfolio.name).then(unwrapRobinhoodToolResult)
        : Promise.resolve(null),
      definitions.positions
        ? callRobinhoodTool(wallet, definitions.positions.name).then(unwrapRobinhoodToolResult)
        : Promise.resolve(null),
      definitions.pnl
        ? callRobinhoodTool(wallet, definitions.pnl.name, { period: "day" }).then(
            unwrapRobinhoodToolResult
          )
        : Promise.resolve(null),
    ]);
    return NextResponse.json({
      ok: true,
      connection,
      account: {
        buyingPowerUsd: findNumber(portfolio, ["buying_power", "buyingPower", "cash"]),
        equityUsd: findNumber(portfolio, ["equity", "portfolio_value", "total_value"]),
        dayPnlUsd: findNumber(pnl, ["day_pnl", "todays_pnl", "profit_loss", "realized_pnl"]),
        portfolio,
        positions,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, connection, error: error instanceof Error ? error.message : "Robinhood account read failed" },
      { status: 502 }
    );
  }
}
