import { askAgent } from "@/lib/agent-runtime";
import { resolveAgentIdentity } from "@/lib/agent-identity";
import {
  callRobinhoodTool,
  findRobinhoodTool,
  listRobinhoodTools,
  unwrapRobinhoodToolResult,
} from "@/lib/robinhood-mcp-client";
import { proposeRobinhoodTrade } from "@/lib/robinhood-executor";
import { getRobinhoodConnection, getTradingPolicy } from "@/lib/robinhood-trading";

interface HouseOrder {
  symbol?: string;
  side?: "buy" | "sell";
  quantity?: number;
  notionalUsd?: number;
  thesis?: string;
  confidence?: number;
  orderType?: "market" | "limit";
  limitPrice?: number;
}

function parseOrders(text: string): HouseOrder[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { orders?: HouseOrder[] };
    return Array.isArray(parsed.orders) ? parsed.orders.slice(0, 1) : [];
  } catch {
    return [];
  }
}

export async function runRobinhoodHouseBot(): Promise<Record<string, unknown>> {
  const wallet = process.env.ROBINHOOD_HOUSE_WALLET?.trim().toLowerCase();
  if (!wallet) return { skipped: "ROBINHOOD_HOUSE_WALLET is not configured" };
  const connection = getRobinhoodConnection(wallet);
  const policy = getTradingPolicy(wallet);
  if (connection.status !== "linked") return { skipped: `connection_${connection.status}` };
  if (!policy.enabled || policy.killSwitch) return { skipped: "policy_halted" };
  if (policy.mode !== "approval" && policy.mode !== "autonomous") {
    return { skipped: `mode_${policy.mode}` };
  }

  const tools = await listRobinhoodTools(wallet);
  const portfolioTool = findRobinhoodTool(tools, ["get_portfolio", "get_account_summary"]);
  const positionsTool = findRobinhoodTool(tools, ["get_positions", "get_open_positions"]);
  const scannerTool = findRobinhoodTool(tools, [
    "get_top_movers",
    "get_market_movers",
    "run_scanner",
    "run_scan",
  ]);
  const [portfolio, positions, scanner] = await Promise.all([
    portfolioTool
      ? callRobinhoodTool(wallet, portfolioTool.name).then(unwrapRobinhoodToolResult)
      : Promise.resolve({ unavailable: true }),
    positionsTool
      ? callRobinhoodTool(wallet, positionsTool.name).then(unwrapRobinhoodToolResult)
      : Promise.resolve({ unavailable: true }),
    scannerTool
      ? callRobinhoodTool(wallet, scannerTool.name).then(unwrapRobinhoodToolResult)
      : Promise.resolve({ unavailable: true }),
  ]);

  const agent = resolveAgentIdentity("robinhood-trading-agent");
  if (!agent) return { skipped: "agent_identity_unavailable" };
  const prompt = [
    "PRIVATE HOUSE BOT RUN. Evaluate the live Robinhood Agentic account context below.",
    "Return only a JSON object with this shape:",
    '{"orders":[{"symbol":"AAPL","side":"buy","quantity":1,"notionalUsd":100,"orderType":"market","thesis":"80+ characters grounded in supplied data","confidence":0.75}]}',
    "Return {\"orders\":[]} unless one setup is clearly supported. Never exceed the supplied policy.",
    `POLICY: ${JSON.stringify(policy)}`,
    `PORTFOLIO: ${JSON.stringify(portfolio).slice(0, 8_000)}`,
    `POSITIONS: ${JSON.stringify(positions).slice(0, 8_000)}`,
    `SCANNER: ${JSON.stringify(scanner).slice(0, 12_000)}`,
  ].join("\n\n");
  const answer = await askAgent(agent, prompt);
  const orders = parseOrders(answer);
  if (!orders.length) return { evaluated: true, proposed: 0 };

  const order = orders[0];
  if (
    !order.symbol ||
    !order.side ||
    !order.quantity ||
    !order.notionalUsd ||
    !order.thesis ||
    order.thesis.length < 80
  ) {
    return { evaluated: true, proposed: 0, rejected: "malformed_agent_order" };
  }
  const hour = new Date().toISOString().slice(0, 13);
  const decision = await proposeRobinhoodTrade({
    wallet,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    notionalUsd: order.notionalUsd,
    orderType: order.orderType ?? "market",
    limitPrice: order.limitPrice,
    thesis: order.thesis,
    confidence: order.confidence,
    idempotencyKey: `house:${hour}:${order.symbol.toUpperCase()}:${order.side}`,
    source: "private-house-bot",
  });
  return { evaluated: true, proposed: 1, decisionId: decision.id, status: decision.status };
}
