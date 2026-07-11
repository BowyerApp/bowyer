/**
 * Live web search via Tavily (https://tavily.com).
 * Injected into the LLM context on every report/answer so agents ground their
 * output in real, current sources instead of hallucinating citations.
 *
 * TAVILY_API_KEY — free tier: 1,000 credits/month.
 */

const TAVILY_URL = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const cache = new Map<string, { at: number; results: WebSearchResult[] }>();

export function webSearchAvailable(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/** Search the live web. Returns [] when unavailable — callers degrade gracefully. */
export async function webSearch(
  query: string,
  maxResults = 5
): Promise<WebSearchResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  const cacheKey = `${query}::${maxResults}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;

  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as { results?: TavilyResult[] };
    const results = (json.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 400),
    }));

    cache.set(cacheKey, { at: Date.now(), results });
    return results;
  } catch {
    return [];
  }
}

/** Format results as a context block for the system prompt. "" when empty. */
export function formatSearchContext(query: string, results: WebSearchResult[]): string {
  if (results.length === 0) return "";
  return [
    `Live web search results for "${query}" (fetched just now — these are real, current sources):`,
    ...results.map(
      (r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`
    ),
    "When you reference facts from these sources, cite them by URL. Do NOT invent citations or URLs that are not listed above.",
  ].join("\n\n");
}

/**
 * Deep research: decompose the topic into sub-queries, search each, and merge
 * unique sources. Used by research-focused agents for real multi-source output.
 */
export async function deepResearch(
  topic: string,
  subQueries: string[]
): Promise<{ query: string; results: WebSearchResult[] }[]> {
  if (!webSearchAvailable()) return [];
  const queries = [topic, ...subQueries].slice(0, 4);
  const settled = await Promise.all(
    queries.map(async (q) => ({ query: q, results: await webSearch(q, 4) }))
  );
  // Deduplicate URLs across query groups, keeping first occurrence.
  const seen = new Set<string>();
  return settled.map((group) => ({
    query: group.query,
    results: group.results.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    }),
  }));
}

/** Format deep-research groups into one context block. */
export function formatDeepResearchContext(
  groups: { query: string; results: WebSearchResult[] }[]
): string {
  const nonEmpty = groups.filter((g) => g.results.length > 0);
  if (nonEmpty.length === 0) return "";
  const blocks = nonEmpty.map((g) =>
    [
      `── Sources for "${g.query}" ──`,
      ...g.results.map((r) => `• ${r.title} — ${r.url}\n  ${r.snippet}`),
    ].join("\n")
  );
  return [
    "Deep research context (live web, fetched just now):",
    ...blocks,
    "Ground every claim in these sources and cite by URL. Never fabricate a source.",
  ].join("\n\n");
}
