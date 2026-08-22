/**
 * Signal Analyst — the LLM-driven strategy.
 *
 * Every engine tick it runs the mechanical exits (stop-loss / trailing) like
 * any other strategy. At most once per LLM_INTERVAL it goes further: fetches
 * the instance's knowledge sources live (wallets, Telegram, PDFs, APIs),
 * shows the LLM the tradeable market plus current positions, and asks for
 * orders as strict JSON.
 *
 * The LLM proposes; the rails dispose. Its output is filtered to tokens in
 * the tradeable universe, clamped to the instance's clip/position/daily caps,
 * and executed by the same swap path as every other strategy. It cannot name
 * an arbitrary token, size beyond caps, or move funds anywhere but the pair.
 */

import { resolveRuntimeLlm } from "@/lib/llm-config";
import type { StrategyInput, Order } from "@/lib/trading/strategies";
import { stopAndTrailExits, tradeable } from "@/lib/trading/strategies";
import type { ScreenerToken } from "@/lib/market-data";

const LLM_INTERVAL_MS = 15 * 60 * 1000;
const MAX_ORDERS_PER_DECISION = 2;
const UNIVERSE_SIZE = 15;

const lastDecisionAt = new Map<string, number>();

interface LlmOrder {
  side?: string;
  symbol?: string;
  usd?: number;
  fraction?: number;
  reason?: string;
}

function marketTable(tokens: ScreenerToken[]): string {
  const rows = tokens.map((t) => {
    const liq = Math.round((t.liquidityUsd ?? 0) / 1000);
    const vol = Math.round((t.volume24h ?? 0) / 1000);
    return `${t.symbol} | $${t.priceUsd?.toPrecision(4)} | 1h ${t.change1h?.toFixed(1) ?? "?"}% | 24h ${t.change24h?.toFixed(1) ?? "?"}% | liq $${liq}k | vol $${vol}k | ${t.buys24h ?? 0}/${t.sells24h ?? 0} buys/sells`;
  });
  return ["SYMBOL | PRICE | 1H | 24H | LIQUIDITY | 24H VOLUME | FLOW", ...rows].join("\n");
}

async function fetchContext(input: StrategyInput): Promise<string> {
  const sources = input.agent.config.sources ?? [];
  if (sources.length === 0) return "";
  try {
    const { buildContextFromSources } = await import("@/lib/knowledge-sources");
    return await buildContextFromSources(sources, `trading:${input.agent.id}`);
  } catch {
    return "";
  }
}

function parseOrders(raw: string): LlmOrder[] {
  try {
    const json = JSON.parse(raw) as { orders?: LlmOrder[] };
    return Array.isArray(json.orders) ? json.orders : [];
  } catch {
    return [];
  }
}

/** Turn LLM proposals into engine orders, enforcing every hard rail. */
function validateOrders(
  proposals: LlmOrder[],
  input: StrategyInput,
  universe: ScreenerToken[]
): Order[] {
  const { agent, positions, cashUsd } = input;
  const cfg = agent.config;
  const bySymbol = new Map(universe.map((t) => [t.symbol.toUpperCase(), t]));
  const held = new Map(positions.map((p) => [p.symbol.toUpperCase(), p]));
  const orders: Order[] = [];
  let cashLeft = cashUsd;
  let openCount = positions.length;

  for (const p of proposals.slice(0, MAX_ORDERS_PER_DECISION)) {
    const symbol = String(p.symbol ?? "").toUpperCase();
    const reason = `analyst: ${String(p.reason ?? "no reason given").slice(0, 180)}`;

    if (p.side === "buy") {
      const t = bySymbol.get(symbol);
      if (!t || !t.priceUsd) continue;
      const pos = held.get(symbol);
      const currentValue = pos ? pos.qty * t.priceUsd : 0;
      if (!pos && openCount >= cfg.maxOpenPositions) continue;
      const room = cfg.maxPositionUsd - currentValue;
      const usd = Math.min(Number(p.usd) || cfg.clipUsd, cfg.clipUsd, room, cashLeft);
      if (usd < 10) continue;
      cashLeft -= usd;
      if (!pos) openCount += 1;
      orders.push({
        side: "buy",
        token: t.address.toLowerCase(),
        symbol: t.symbol,
        usd,
        priceUsd: t.priceUsd,
        reason,
      });
    } else if (p.side === "sell") {
      const pos = held.get(symbol);
      if (!pos) continue;
      const t = bySymbol.get(symbol);
      const price = t?.priceUsd ?? pos.avgCostUsd;
      const fraction = Math.min(1, Math.max(0.1, Number(p.fraction) || 1));
      orders.push({
        side: "sell",
        token: pos.token,
        symbol: pos.symbol,
        fraction,
        priceUsd: price,
        reason,
      });
    }
  }
  return orders;
}

export async function signalAnalyst(input: StrategyInput): Promise<Order[]> {
  const { agent, tokens, positions, cashUsd } = input;
  const cfg = agent.config;

  // Risk management is mechanical and runs on every 60s tick, LLM or not.
  const exits = stopAndTrailExits(input, { trailPct: 0.12, maxHoldHours: 96 });
  if (exits.length > 0) return exits;

  const last = lastDecisionAt.get(agent.id) ?? 0;
  if (Date.now() - last < LLM_INTERVAL_MS) return [];
  lastDecisionAt.set(agent.id, Date.now());

  const universe = tokens
    .filter((t) => tradeable(t, cfg))
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, UNIVERSE_SIZE);
  if (universe.length === 0) return [];

  const context = await fetchContext(input);
  const positionLines =
    positions.length === 0
      ? "none"
      : positions
          .map((p) => {
            const t = tokens.find((x) => x.address.toLowerCase() === p.token);
            const px = t?.priceUsd ?? p.avgCostUsd;
            const pnl = ((px - p.avgCostUsd) / p.avgCostUsd) * 100;
            return `${p.symbol}: ${p.qty.toPrecision(4)} @ avg $${p.avgCostUsd.toPrecision(4)}, now $${px.toPrecision(4)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%)`;
          })
          .join("\n");

  const system =
    "You are a disciplined trading analyst managing a small on-chain portfolio. " +
    "You only trade tokens from the provided market table. You respond with strict JSON: " +
    '{"orders":[{"side":"buy"|"sell","symbol":"...","usd":number,"fraction":number,"reason":"..."}]} ' +
    `with at most ${MAX_ORDERS_PER_DECISION} orders. An empty orders array is a valid and often correct answer. ` +
    "For buys set usd (position size). For sells set fraction (0.1-1.0 of the position). " +
    "Every reason must cite the concrete data that motivated it. Do not trade without an edge.";

  const user = [
    agent.config.brief ? `OWNER'S MANDATE:\n${cfg.brief}` : "",
    context ? `LIVE INTELLIGENCE:\n${context}` : "",
    `MARKET (only these are tradeable):\n${marketTable(universe)}`,
    `OPEN POSITIONS:\n${positionLines}`,
    `CASH: $${cashUsd.toFixed(0)} | max clip $${cfg.clipUsd} | max position $${cfg.maxPositionUsd} | open ${positions.length}/${cfg.maxOpenPositions}`,
    "Decide now. JSON only.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { model, apiKey, baseUrl } = resolveRuntimeLlm(null);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey ?? "ollama"}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`analyst LLM ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "";

  return validateOrders(parseOrders(content), input, universe);
}
