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
 * the tradeable universe and clamped to an ADAPTIVE risk budget: the agent's
 * realized win rate, streak, and drawdown expand or shrink its size, stops,
 * and position count every cycle (see risk.ts), inside a fixed outer
 * envelope. It cannot name an arbitrary token, size beyond the budget, or
 * move funds anywhere but the pair.
 */

import { fallbackRuntimeLlm, resolveRuntimeLlm, tradingRuntimeLlm } from "@/lib/llm-config";
import type { StrategyInput, Order } from "@/lib/trading/strategies";
import { stopAndTrailExits, tradeable } from "@/lib/trading/strategies";
import { memoriesFor, recordDecision } from "@/lib/trading/store";
import { getThesisStyleExemplars } from "@/lib/trading/fomo-style";
import { adaptiveRisk, buySizeCap, protections, type Protections, type RiskProfile } from "@/lib/trading/risk";
import type { ScreenerToken } from "@/lib/market-data";

const LLM_INTERVAL_MS = Number(process.env.ANALYST_INTERVAL_MS) || 15 * 60 * 1000;
const MAX_ORDERS_PER_DECISION = 2;
/** fomo is a presence game — allow more simultaneous actions per cycle. */
const MAX_ORDERS_FOMO = 4;
const UNIVERSE_SIZE = 18;

function maxOrdersFor(agent: StrategyInput["agent"]): number {
  return agent.config.venue === "fomo" ? MAX_ORDERS_FOMO : MAX_ORDERS_PER_DECISION;
}

const lastDecisionAt = new Map<string, number>();

/** For fomo agents, feed the model real community theses so ours match the culture. */
function fomoStyleBlock(agent: StrategyInput["agent"]): string {
  if (agent.config.venue !== "fomo") return "";
  const examples = getThesisStyleExemplars(6);
  if (examples.length === 0) return "";
  const block = examples.map((e, i) => `${i + 1}. (@${e.handle}) ${e.text}`).join("\n");
  return (
    " Your thesis will be posted to the fomo.family feed, where real traders write theirs. " +
    "Match that voice — direct, specific, a little bold, no corporate hedging. Do NOT copy these; learn the register:\n" +
    block
  );
}

/** For fomo agents: a high-velocity presence desk — act every cycle when the data allows. */
function fomoActivityNudge(agent: StrategyInput["agent"]): string {
  if (agent.config.venue !== "fomo") return "";
  return (
    " THIS IS A HIGH-VELOCITY DESK building a public presence on fomo — activity IS the strategy, " +
    "as long as every action has a cited edge. Each cycle, actively look for ALL of these: " +
    "(1) a starter in the best fresh setup you don't hold; (2) an add to a winner that's confirming; " +
    "(3) a trim into strength on anything up big; (4) a rotation out of your weakest/stalest holding into a stronger setup. " +
    "Small clips, quick trims, fast rotation — many small well-reasoned trades beat a few big ones here. " +
    "The board spans ALL of Solana plus Robinhood Chain (rows tagged RHC): fresh launches, animal coins, AI coins, stock-parody memes, whatever is trending. " +
    "Do NOT concentrate the book in a single narrative just because it dominates today's volume — if every position " +
    "you hold is the same meta, rotate at least one clip into the strongest setup from a different one. " +
    "Sitting completely flat should be RARE and only when the entire board is genuinely bad; an empty orders array " +
    "on a board with multiple QUALITY 80+ names means you are not doing your job. " +
    "Never invent an edge that isn't in the data — every order still needs concrete numbers behind it."
  );
}

interface LlmOrder {
  side?: string;
  symbol?: string;
  usd?: number;
  fraction?: number;
  reason?: string;
  /** Full trade thesis the desk would publish alongside the trade. */
  thesis?: string;
}

const MIN_QUALITY_SCORE = Number(process.env.TRADING_MIN_SCORE) || 45;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Deterministic 0–100 tradeability/quality score, computed OUTSIDE the LLM.
 * Inspired by the biggest lesson from profitable open-source memecoin agents
 * (e.g. circuit-agent): strict pre-filtering on liquidity, real two-sided flow,
 * turnover, holder base, and age lifts win rate far more than any prompt. The
 * model only reasons over names that clear this bar. Direction is the model's
 * call; this gate is about "is this even worth risking capital on".
 */
function qualityScore(t: ScreenerToken): number {
  const liq = t.liquidityUsd ?? 0;
  if (liq < 15_000) return 0; // illiquid / rug-prone — never trade
  const vol = t.volume24h ?? 0;
  const buys = t.buys24h ?? 0;
  const sells = t.sells24h ?? 0;
  const holders = t.holders ?? 0;
  // Unknown holder count (RHC screener doesn't report it) scores neutral —
  // zero would silently dock every Robinhood Chain name 12 points.
  const holdersUnknown = t.holders == null;
  const age = t.ageMinutes ?? 0;
  const c1 = t.change1h ?? 0;
  const c5 = t.change5m ?? 0;

  const liqScore = clamp01((liq - 15_000) / 185_000); // 15k → 200k
  const turnover = clamp01(vol / Math.max(liq, 1) / 3); // up to 3× liquidity
  const flow = buys + sells > 0 ? clamp01((buys / (buys + sells) - 0.4) / 0.4) : 0.3;
  const holderScore = holdersUnknown ? 0.5 : clamp01(holders / 2_000);
  const ageScore = age <= 0 ? 0.4 : age < 30 ? 0.5 : age < 4_320 ? 1 : 0.75; // sweet spot 30m–3d
  // Mild momentum tilt so lively names rank above flat ones (not a direction call).
  const momentum = clamp01((c1 + 60) / 120) * 0.6 + clamp01((c5 + 30) / 60) * 0.4;

  const score =
    liqScore * 0.25 +
    turnover * 0.2 +
    flow * 0.18 +
    holderScore * 0.12 +
    ageScore * 0.1 +
    momentum * 0.15;
  return Math.round(score * 100);
}

function ageLabel(min: number | null | undefined): string {
  if (!min || min <= 0) return "?";
  if (min < 90) return `${min}m`;
  if (min < 2_880) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1_440)}d`;
}

function marketTable(tokens: ScreenerToken[]): string {
  // Dual-book universes (fomo) mix Solana mints and Robinhood Chain 0x
  // tokens — tag each row so the model can respect per-chain cash.
  const mixedChains =
    tokens.some((t) => t.address.startsWith("0x")) && tokens.some((t) => !t.address.startsWith("0x"));
  const rows = tokens.map((t) => {
    const liq = Math.round((t.liquidityUsd ?? 0) / 1000);
    const vol = Math.round((t.volume24h ?? 0) / 1000);
    const buys = t.buys24h ?? 0;
    const sells = t.sells24h ?? 0;
    const flow = buys + sells > 0 ? (buys / (buys + sells)).toFixed(2) : "?";
    const turn = liq > 0 ? (vol / liq).toFixed(1) : "?";
    const chain = mixedChains ? `${t.address.startsWith("0x") ? "RHC" : "SOL"} | ` : "";
    return (
      `${t.symbol} | ${chain}Q${qualityScore(t)} | $${t.priceUsd?.toPrecision(4)} | ` +
      `5m ${t.change5m?.toFixed(1) ?? "?"}% 1h ${t.change1h?.toFixed(1) ?? "?"}% 24h ${t.change24h?.toFixed(1) ?? "?"}% | ` +
      `liq $${liq}k | vol $${vol}k | turn ${turn}x | flow ${flow} (${buys}/${sells}) | ` +
      `${t.holders ?? "?"} hldrs | age ${ageLabel(t.ageMinutes)}`
    );
  });
  return [
    `SYMBOL | ${mixedChains ? "CHAIN | " : ""}QUALITY(0-100) | PRICE | MOMENTUM | LIQUIDITY | 24H VOL | TURNOVER | BUY-FLOW | HOLDERS | AGE`,
    `(QUALITY is a deterministic pre-trade gate; buys below Q${MIN_QUALITY_SCORE} are rejected by the risk system.)`,
    ...rows,
  ].join("\n");
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

/**
 * Salvage the JSON object from an LLM completion: strip markdown fences and
 * any prose around the outermost braces. Models occasionally wrap or preface
 * their JSON even when asked not to; that must not void a trading decision.
 */
function extractJson(raw: string): string {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
}

function parseOrders(raw: string): LlmOrder[] {
  try {
    const json = JSON.parse(extractJson(raw)) as { orders?: LlmOrder[] };
    return Array.isArray(json.orders) ? json.orders : [];
  } catch {
    return [];
  }
}

/**
 * Address key for matching positions to the universe. EVM (0x…) and
 * Hyperliquid (hl:…) addresses are lowercased; Solana mints are base58 and
 * case-sensitive, so they must be preserved verbatim — the same rule the
 * engine uses so an order's token is executable as-is.
 */
function tokenKey(address: string): string {
  return address.startsWith("0x") || address.startsWith("hl:") ? address.toLowerCase() : address;
}

/** Compact market-data line for a token, used in thesis generation. */
function tokenDataLine(t?: ScreenerToken): string {
  if (!t) return "";
  const liq = Math.round((t.liquidityUsd ?? 0) / 1000);
  const vol = Math.round((t.volume24h ?? 0) / 1000);
  return `price $${t.priceUsd?.toPrecision(4)}, 1h ${t.change1h?.toFixed(1) ?? "?"}%, 24h ${t.change24h?.toFixed(1) ?? "?"}%, liq $${liq}k, 24h vol $${vol}k, ${t.buys24h ?? 0}/${t.sells24h ?? 0} buys/sells`;
}

/** Never-empty deterministic thesis, used if the LLM call is unavailable. */
function fallbackThesis(side: "buy" | "sell", symbol: string, reason?: string, t?: ScreenerToken): string {
  const clean = (reason ?? "").replace(/^analyst:\s*/i, "").trim();
  const data = tokenDataLine(t);
  if (side === "buy") {
    return (
      `Entered $${symbol} on a systematic momentum + liquidity trigger${clean ? ` — ${clean}` : ""}. ` +
      (data ? `Read on entry: ${data}. ` : "") +
      `Small starter clip, stop armed; I add on confirmation and cut if the setup breaks. Fully automated by @BOWYERBOT.`
    ).slice(0, 500);
  }
  return (
    `Trimmed $${symbol}${clean ? ` — ${clean}` : ""}. ` +
    (data ? `Tape now: ${data}. ` : "") +
    `Taking risk off into strength / protecting the book per plan. Fully automated by @BOWYERBOT.`
  ).slice(0, 500);
}

/**
 * Guaranteed trade thesis for the fomo feed. Tries a focused LLM call that
 * matches the community's voice (learned exemplars), and always falls back to a
 * deterministic, data-cited line so a fill is NEVER posted without a thesis.
 */
export async function writeThesis(input: {
  side: "buy" | "sell";
  symbol: string;
  reason?: string;
  token?: ScreenerToken;
}): Promise<string> {
  const { side, symbol, reason, token } = input;
  const fb = fallbackThesis(side, symbol, reason, token);
  try {
    const exs = getThesisStyleExemplars(5);
    const style = exs.length
      ? "\nThis posts to the fomo.family feed where real traders write theirs. Match that voice (do NOT copy):\n" +
        exs.map((e, i) => `${i + 1}. ${e.text}`).join("\n")
      : "";
    const system =
      "You are a sharp on-chain trader writing a short public thesis for a trade you JUST executed. " +
      "First person, confident, specific. No markdown, no hashtags, under 400 characters. " +
      "Cover the setup, the concrete edge (cite the numbers), the risk/invalidation, and the plan or target." +
      style;
    const user =
      `You just ${side === "buy" ? "BOUGHT" : "SOLD"} $${symbol}. ` +
      `${(reason ?? "").replace(/^analyst:\s*/i, "")}\n` +
      (token ? `Live data: ${tokenDataLine(token)}\n` : "") +
      `Write the thesis now.`;
    const out = (await llmChat(system, user, { maxTokens: 200 })).trim();
    const cleaned = out.replace(/^["']|["']$/g, "").trim();
    return cleaned.length >= 40 ? cleaned.slice(0, 500) : fb;
  } catch {
    return fb;
  }
}

/** Turn LLM proposals into engine orders, enforcing the current risk budget. */
function validateOrders(
  proposals: LlmOrder[],
  input: StrategyInput,
  universe: ScreenerToken[],
  risk: RiskProfile,
  guard: Protections
): Order[] {
  const { positions, cashUsd } = input;
  const bySymbol = new Map(universe.map((t) => [t.symbol.toUpperCase(), t]));
  const held = new Map(positions.map((p) => [p.symbol.toUpperCase(), p]));
  const orders: Order[] = [];
  let cashLeft = cashUsd;
  let openCount = positions.length;
  const equityUsd =
    cashUsd +
    positions.reduce((sum, p) => {
      const t = universe.find((x) => tokenKey(x.address) === p.token);
      return sum + p.qty * (t?.priceUsd ?? p.avgCostUsd);
    }, 0);

  for (const p of proposals.slice(0, maxOrdersFor(input.agent))) {
    const symbol = String(p.symbol ?? "").toUpperCase();
    const reason = `analyst: ${String(p.reason ?? "no reason given").slice(0, 180)}`;

    if (p.side === "buy") {
      if (guard.entriesHalted) continue;
      const t = bySymbol.get(symbol);
      if (!t || !t.priceUsd) continue;
      if (guard.cooldownTokens.has(t.address.toLowerCase())) continue;
      // Deterministic quality gate: never open a NEW position in a name that
      // fails the safety/quality bar, regardless of what the model argued.
      const pos0 = held.get(symbol);
      if (!pos0 && qualityScore(t) < MIN_QUALITY_SCORE) continue;
      const pos = held.get(symbol);
      const currentValue = pos ? pos.qty * t.priceUsd : 0;
      if (!pos && openCount >= risk.maxOpenPositions) continue;
      const room = risk.maxPositionUsd - currentValue;
      let usd = Math.min(Number(p.usd) || risk.clipUsd, risk.clipUsd, room, cashLeft);
      usd = buySizeCap(usd, {
        equityUsd,
        stopLossPct: risk.stopLossPct,
        change24hPct: t.change24h ?? null,
        liquidityUsd: t.liquidityUsd ?? null,
      });
      if (usd < 10) continue;
      cashLeft -= usd;
      if (!pos) openCount += 1;
      const thesis = String(p.thesis ?? "").trim().slice(0, 600) || undefined;
      orders.push({
        side: "buy",
        token: tokenKey(t.address),
        symbol: t.symbol,
        usd,
        priceUsd: t.priceUsd,
        reason,
        thesis,
      });
    } else if (p.side === "sell") {
      const pos = held.get(symbol);
      if (!pos) continue;
      const t = bySymbol.get(symbol);
      const price = t?.priceUsd ?? pos.avgCostUsd;
      const fraction = Math.min(1, Math.max(0.1, Number(p.fraction) || 1));
      const thesis = String(p.thesis ?? "").trim().slice(0, 600) || undefined;
      orders.push({
        side: "sell",
        token: pos.token,
        symbol: pos.symbol,
        fraction,
        priceUsd: price,
        reason,
        thesis,
      });
    }
  }
  return orders;
}

class LlmHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function chatOnce(
  llm: { model: string; apiKey: string | undefined; baseUrl: string },
  system: string,
  user: string,
  opts: { json?: boolean; maxTokens?: number }
): Promise<string> {
  const res = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llm.apiKey ?? "ollama"}`,
    },
    body: JSON.stringify({
      model: llm.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: opts.maxTokens ?? 500,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new LlmHttpError(res.status, `analyst LLM ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "";
  // Reasoning models can burn the whole budget on hidden thinking and return an
  // empty completion. Treat that as a failure so the fallback chain engages
  // instead of silently handing an empty string to the decision parser.
  if (!content.trim()) throw new Error("analyst LLM empty completion");
  return content;
}

/**
 * Rail cooldowns, keyed by provider host. A 402 means that account is out of
 * credits — it will not heal within a cycle, so retrying it every call just
 * adds latency and burns the surviving rail's budget on failed attempts.
 * Park the broke host for a while and run degraded (skip the debate, keep
 * deciding on whatever rail still answers).
 */
const railDownUntil = new Map<string, number>();
function railParked(baseUrl: string): boolean {
  return Date.now() < (railDownUntil.get(new URL(baseUrl).hostname) ?? 0);
}
export function llmDegraded(): boolean {
  const premium = tradingRuntimeLlm();
  return premium ? railParked(premium.baseUrl) : false;
}

/**
 * Primary LLM first; on any failure (the shared Groq free tier is 8k
 * tokens/min across the whole platform, so 429s are routine) the call walks
 * the whole chain — premium (OpenRouter), explicit fallback (Groq), platform
 * default — so trading decisions only starve when every rail is down.
 */
async function llmChat(
  system: string,
  user: string,
  opts: { json?: boolean; maxTokens?: number; tier?: "reasoning" | "fast" } = {}
): Promise<string> {
  // The final trade decision runs on the best reasoning model (Claude Opus 5 by
  // default, via OpenRouter). Supporting calls (debate, thesis) stay on the fast
  // default to control cost. Any failure falls back down the chain.
  const chain: { model: string; apiKey: string | undefined; baseUrl: string }[] = [];
  if (opts.tier === "reasoning") {
    const premium = tradingRuntimeLlm();
    if (premium) chain.push(premium);
  }
  chain.push(resolveRuntimeLlm(null));
  const fb = fallbackRuntimeLlm();
  if (fb) chain.push(fb);

  // Skip parked (out-of-credit) hosts unless nothing else remains.
  const live = chain.filter((c) => !railParked(c.baseUrl));
  const candidates = live.length > 0 ? live : chain.slice(-1);

  const seen = new Set<string>();
  let lastErr: unknown = new Error("no LLM configured");
  for (const llm of candidates) {
    const key = `${llm.baseUrl}|${llm.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const host = new URL(llm.baseUrl).hostname;
    try {
      return await chatOnce(llm, system, user, opts);
    } catch (err) {
      lastErr = err;
      if (err instanceof LlmHttpError && err.status === 402) {
        railDownUntil.set(host, Date.now() + 15 * 60_000);
        console.warn(`[analyst] ${llm.model} @ ${host} out of credits (402) — host parked 15m, running degraded`);
      } else {
        console.warn(`[analyst] ${llm.model} @ ${host} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  throw lastErr;
}

export async function signalAnalyst(input: StrategyInput): Promise<Order[]> {
  const { agent, tokens, positions, cashUsd } = input;
  const cfg = agent.config;

  // Adaptive risk: the agent's own track record sets today's budget —
  // stops, trail, size, and position count all move with performance.
  let risk = adaptiveRisk(agent.id, cfg);

  // fomo: high-velocity presence desk — more, smaller shots. Wider position
  // count, tighter clips, faster stale-position rotation. Per-trade risk goes
  // DOWN even as trade count goes up.
  const onFomo = cfg.venue === "fomo";
  if (onFomo) {
    risk = {
      ...risk,
      maxOpenPositions: Math.max(risk.maxOpenPositions, 5),
      clipUsd: Math.min(risk.clipUsd, 60),
    };
  }

  // Risk management is mechanical and runs on every 60s tick, LLM or not.
  const exits = stopAndTrailExits(input, {
    trailPct: risk.trailPct,
    stopLossPct: risk.stopLossPct,
    breakevenAfterPct: 0.08,
    maxHoldHours: onFomo ? 48 : 96,
  });
  if (exits.length > 0) {
    console.log(
      `[analyst] mechanical exits for ${agent.id.slice(0, 8)}: ${exits.map((e) => `${e.symbol} (${e.reason})`).join("; ")}`
    );
    return exits;
  }

  // Freqtrade-style protections: cooldowns and entry halts.
  const guard = protections(agent.id);

  const last = lastDecisionAt.get(agent.id) ?? 0;
  if (Date.now() - last < LLM_INTERVAL_MS) return [];
  lastDecisionAt.set(agent.id, Date.now());

  try {
    return await runDecision(input, risk, guard);
  } catch (err) {
    // A failed LLM call must not burn the whole 15-minute window — allow a
    // retry on a tick ~3 minutes out instead.
    lastDecisionAt.set(agent.id, Date.now() - LLM_INTERVAL_MS + 3 * 60 * 1000);
    throw err;
  }
}

async function runDecision(
  input: StrategyInput,
  risk: RiskProfile,
  guard: Protections
): Promise<Order[]> {
  const { agent, tokens, positions, cashUsd } = input;
  const cfg = agent.config;

  // Rank by the deterministic quality score, not raw volume, so the model spends
  // its reasoning on the highest-quality names that clear the safety bar.
  const eligible = tokens.filter((t) => tradeable(t, cfg));
  const byQuality = [...eligible].sort((a, b) => qualityScore(b) - qualityScore(a));
  let universe = byQuality.slice(0, UNIVERSE_SIZE);
  // On fomo, reserve slots for the hottest movers that still clear the buy
  // gate. Quality rank alone favors older high-holder names, which quietly
  // narrows the book to whatever meta dominates volume — the model must also
  // see what is breaking out right now.
  if (cfg.venue === "fomo") {
    const core = byQuality.slice(0, UNIVERSE_SIZE - 5);
    const chosen = new Set(core.map((t) => t.address));
    const heat = (t: ScreenerToken) => (t.change1h ?? 0) + (t.change5m ?? 0) * 2;
    const movers = eligible
      .filter((t) => !chosen.has(t.address) && qualityScore(t) >= MIN_QUALITY_SCORE)
      .sort((a, b) => heat(b) - heat(a))
      .slice(0, 5);
    universe = [...core, ...movers];
  }
  if (universe.length === 0) return [];

  const context = await fetchContext(input);

  // Memecoins trade on attention, so the numbers alone aren't the whole tape.
  // Pull what traders are actually saying about each candidate — live X/web
  // chatter for the ticker, the fomo thesis feed for that exact token, and
  // whether smart-money traders we track are the ones talking — so the model
  // weighs narrative and crowd positioning alongside price/liquidity.
  let socialBlock = "";
  if (cfg.venue === "fomo") {
    try {
      const { socialIntelBatch } = await import("@/lib/trading/social-intel");
      socialBlock = await socialIntelBatch(
        universe.map((t) => ({ symbol: t.symbol, address: t.address })),
        6
      );
    } catch {
      /* social intel is an enhancement — decide on the tape alone if it fails */
    }
  }
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

  const lessons = memoriesFor(agent.id, 10);
  const lessonLines =
    lessons.length === 0 ? "" : lessons.map((m) => `- ${m.lesson}`).join("\n");

  const briefing = [
    cfg.brief ? `OWNER'S MANDATE:\n${cfg.brief}` : "",
    context ? `LIVE INTELLIGENCE:\n${context}` : "",
    lessonLines ? `LESSONS FROM THIS AGENT'S OWN PAST TRADES:\n${lessonLines}` : "",
    `MARKET (only these are tradeable):\n${marketTable(universe)}`,
    socialBlock
      ? `SOCIAL / NARRATIVE INTELLIGENCE (live X + web chatter and the fomo thesis feed per ticker — this is what the crowd is saying right now):\n${socialBlock}`
      : "",
    `OPEN POSITIONS:\n${positionLines}`,
    `CASH: $${cashUsd.toFixed(0)}${input.cashNote ? ` (${input.cashNote} — a buy can only spend the cash on that token's own chain, so size accordingly)` : ""} | max clip $${risk.clipUsd} | max position $${risk.maxPositionUsd} | open ${positions.length}/${risk.maxOpenPositions}`,
    `CURRENT RISK BUDGET (earned by your own track record, recalculated every cycle): ${risk.rationale}`,
    `ACTIVE PROTECTIONS: ${guard.summary}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Debate mode (default on): bull and bear argue in parallel, the
  // risk officer reads both cases and makes the final call.
  const debate: { role: string; view: string }[] = [];
  let debateBlock = "";
  // Degraded mode (premium rail out of credits): every call rides the shared
  // Groq budget, so spend it on the decision itself, not the two-sided debate.
  if (cfg.debate !== false && !llmDegraded()) {
    try {
      const [bull, bear] = await Promise.all([
        llmChat(
          "You are the BULL analyst on a trading desk. Argue the strongest case FOR deploying capital right now: which token, why, what concrete data supports it. If nothing is worth buying, say so and explain. 120 words max.",
          briefing,
          { maxTokens: 220 }
        ),
        llmChat(
          "You are the BEAR analyst on a trading desk. Argue the strongest case AGAINST deploying capital right now: what could go wrong, which positions look stretched, what the data warns about. 120 words max.",
          briefing,
          { maxTokens: 220 }
        ),
      ]);
      debate.push({ role: "bull", view: bull.trim() }, { role: "bear", view: bear.trim() });
      debateBlock = `\n\nDESK DEBATE:\nBULL CASE:\n${bull.trim()}\n\nBEAR CASE:\n${bear.trim()}`;
    } catch {
      /* debate is an enhancement — fall through to the single-call decision */
    }
  }

  const system =
    "You are the RISK OFFICER — the final word on a trading desk managing a small on-chain portfolio. " +
    (debateBlock ? "Weigh the bull and bear cases from your desk, then decide. " : "") +
    "You only trade tokens from the provided market table. You respond with strict JSON: " +
    '{"reasoning":"one tight paragraph (under 100 words) explaining your decision","orders":[{"side":"buy"|"sell","symbol":"...","usd":number,"fraction":number,"reason":"...","thesis":"..."}]} ' +
    `with at most ${maxOrdersFor(agent)} orders. An empty orders array is a valid answer when nothing clears the bar. ` +
    "For buys set usd (position size). For sells set fraction (0.1-1.0 of the position). " +
    `Each token shows a QUALITY score (0-100), a deterministic safety/liquidity/flow gate. You may ONLY open new positions in names with QUALITY >= ${MIN_QUALITY_SCORE}; lower-quality buys are auto-rejected, so don't waste an order on them. Prefer the highest-quality setups. ` +
    "Every reason must cite the concrete data that motivated it (quality, momentum, flow, turnover). Do not trade without an edge. " +
    "If SOCIAL / NARRATIVE INTELLIGENCE is provided, weigh it heavily — memecoins run on attention. Rising chatter, fresh catalysts, or smart-money traders writing about a name strengthen a long; silence, fading mentions, or warnings (rug talk, dumping, exploit) are a reason to pass or exit even when the tape looks fine. Cite social signals in your reason/thesis when they influenced the call. " +
    "For EVERY order also write a 'thesis': 3-5 punchy sentences a trader would post publicly to justify the trade — " +
    "the setup, the concrete edge/catalyst (cite the numbers: volume, flow, price action), the risk and what invalidates it, " +
    "and the target or plan. First person, confident, no markdown, no hashtags, under 500 characters." +
    fomoStyleBlock(agent) +
    fomoActivityNudge(agent);

  const content = await llmChat(system, `${briefing}${debateBlock}\n\nDecide now. JSON only.`, {
    // Headroom for adaptive-reasoning models: hidden thinking + the JSON answer
    // (reasoning, orders, and a thesis per order) must ALL fit or the JSON
    // truncates mid-string and the entire decision — including exits — is lost.
    // Degraded (non-reasoning) rails don't burn hidden thinking, and Groq
    // admission-controls on max_tokens — ask for less to actually get served.
    json: true,
    maxTokens: llmDegraded() ? 1600 : 4000,
    tier: "reasoning",
  });

  let reasoning = "";
  try {
    reasoning = String((JSON.parse(extractJson(content)) as { reasoning?: string }).reasoning ?? "");
  } catch {
    /* orders parsing below has its own fallback */
  }
  if (!reasoning) {
    console.warn(`[analyst] decision parse produced no reasoning; head: ${content.slice(0, 200)}`);
  }

  const orders = validateOrders(parseOrders(content), input, universe, risk, guard);

  try {
    recordDecision({
      agentId: agent.id,
      reasoning: reasoning || "(no reasoning returned)",
      orders: orders.map((o) => ({
        side: o.side,
        symbol: o.symbol,
        usd: o.usd,
        fraction: o.fraction,
        reason: o.reason,
      })),
      debate: debate.length > 0 ? debate : undefined,
      contextNote: `${universe.length} tokens screened, ${context ? "sources fetched" : "no sources"}, ${socialBlock ? `social intel on ${socialBlock.split("\n\n").length} names` : "no social intel"}, ${lessons.length} lessons | ${risk.rationale} | protections: ${guard.summary}`,
    });
  } catch {
    /* the trail must never block trading */
  }

  return orders;
}
