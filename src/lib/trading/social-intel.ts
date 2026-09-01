/**
 * Social / narrative intelligence for memecoin decisions.
 *
 * For memecoins, attention IS the fundamental. Price and liquidity tell you if a
 * name is tradeable; they don't tell you if it's about to run. This module pulls
 * the things that actually move these tokens and hands them to the reasoning
 * model so it weighs narrative alongside the numbers:
 *
 *   1. Live web + X chatter for the ticker (Tavily, real-time + cited). This is
 *      the programmatic version of "type the ticker into Twitter and read the
 *      room" — recent posts, news, and a synthesized sentiment read.
 *   2. On-platform trader talk: the fomo thesis feed for the exact token — how
 *      many traders are writing about it and what they're saying.
 *   3. Smart-money positioning: whether traders we track/follow (ranked by real
 *      track record) are the ones talking about it.
 *
 * Everything is grounded in retrieved data (no free-form hallucination), cached
 * per token, and only gathered for the handful of names a decision will weigh.
 */

import { trackedTraders } from "@/lib/trading/store";

const TAVILY_URL = "https://api.tavily.com/search";
const SOLANA_NETWORK_ID = 1399811149;
const CACHE_TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, { at: number; text: string }>();

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

/** Live web + X sentiment for a ticker via Tavily (fresh, cited). */
async function xAndWebChatter(symbol: string): Promise<{ answer: string; hits: string[] }> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return { answer: "", hits: [] };
  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: `$${symbol} Solana memecoin — what are traders saying on X/Twitter right now, sentiment, catalysts, warnings`,
        search_depth: "basic",
        topic: "news",
        days: 3,
        max_results: 5,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { answer: "", hits: [] };
    const data = (await res.json()) as { answer?: string; results?: TavilyResult[] };
    const answer = (data.answer ?? "").trim();
    const hits = (data.results ?? [])
      .slice(0, 3)
      .map((r) => {
        const when = r.published_date ? ` (${String(r.published_date).slice(0, 16)})` : "";
        const snippet = (r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
        return `• ${(r.title ?? "").trim().slice(0, 90)}${when}: ${snippet}`;
      })
      .filter((s) => s.length > 4);
    return { answer: answer.slice(0, 500), hits };
  } catch {
    return { answer: "", hits: [] };
  }
}

interface ThesisFeedItem {
  userId?: string;
  userHandle?: string;
  displayName?: string;
  comment?: { comment?: string } | string;
}

function itemText(i: ThesisFeedItem): string {
  const c = i.comment;
  return (typeof c === "string" ? c : c?.comment ?? "").replace(/\s+/g, " ").trim();
}

/** On-platform trader talk: the fomo thesis feed for this exact token. */
async function fomoTokenTalk(
  tokenAddress: string,
  smartHandles: Set<string>
): Promise<{ count: number; recent: string[]; smartMoney: string[] }> {
  try {
    const { fomoApi } = await import("@/lib/trading/fomo-thesis");
    const qs = new URLSearchParams({ tokenAddress, networkId: String(SOLANA_NETWORK_ID) });
    const ro = (await fomoApi(`/feed/token/thesis?${qs.toString()}`)) as
      | { items?: ThesisFeedItem[] }
      | ThesisFeedItem[];
    const items = Array.isArray(ro) ? ro : (ro.items ?? []);
    const recent: string[] = [];
    const smartMoney = new Set<string>();
    for (const it of items) {
      const handle = (it.userHandle ?? it.displayName ?? "").trim();
      if (handle && smartHandles.has(handle.toLowerCase())) smartMoney.add(`@${handle}`);
      const t = itemText(it);
      if (t.length >= 30 && recent.length < 2) recent.push(`@${handle || "trader"}: ${t.slice(0, 160)}`);
    }
    return { count: items.length, recent, smartMoney: [...smartMoney] };
  } catch {
    return { count: 0, recent: [], smartMoney: [] };
  }
}

/**
 * Gather a compact social-intelligence block for a token. Cached per token.
 * Returns "" when nothing meaningful is found so the briefing stays clean.
 */
export async function socialIntel(symbol: string, tokenAddress: string): Promise<string> {
  if (!symbol || symbol === "?" || !tokenAddress) return "";
  const key = tokenAddress.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text;

  const smartHandles = new Set(
    trackedTraders(50)
      .filter((t) => t.followed || t.score >= 0.4)
      .map((t) => (t.handle ?? "").toLowerCase())
      .filter(Boolean)
  );

  const [web, fomo] = await Promise.all([
    xAndWebChatter(symbol),
    fomoTokenTalk(tokenAddress, smartHandles),
  ]);

  const lines: string[] = [];
  if (fomo.count > 0) {
    lines.push(`fomo feed: ${fomo.count} thesis post(s) on $${symbol}.`);
    if (fomo.smartMoney.length) lines.push(`  smart money writing about it: ${fomo.smartMoney.join(", ")}.`);
    for (const r of fomo.recent) lines.push(`  ${r}`);
  }
  if (web.answer) lines.push(`X/web read: ${web.answer}`);
  for (const h of web.hits) lines.push(`  ${h}`);

  const text = lines.length ? `$${symbol} social:\n${lines.join("\n")}` : "";
  cache.set(key, { at: Date.now(), text });
  return text;
}

/** Gather social intel for several tokens with bounded concurrency. */
export async function socialIntelBatch(
  tokens: { symbol: string; address: string }[],
  limit = 6
): Promise<string> {
  const picks = tokens.slice(0, limit);
  const blocks = await Promise.all(picks.map((t) => socialIntel(t.symbol, t.address).catch(() => "")));
  return blocks.filter(Boolean).join("\n\n");
}
