import { getAgentSources, type KnowledgeSource } from "@/lib/data/agent-registry";

/**
 * Live knowledge ingestion. When a business was launched with sources
 * (website / github / rss), the runtime fetches them and injects the content
 * into the LLM context — so "your business reads them continuously" is true.
 *
 * Content is cached in memory for 10 minutes per URL to keep tool calls fast.
 */

const TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_CHARS_PER_SOURCE = 2_500;
const MAX_SOURCES = 4;

const cache = new Map<string, { at: number; text: string }>();

export const SUPPORTED_SOURCE_TYPES = ["website", "github", "rss"] as const;

export function isValidSourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Strip HTML down to readable text. Crude but dependency-free. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull item titles + descriptions out of an RSS/Atom feed. */
function rssToText(xml: string): string {
  const items: string[] = [];
  const itemRe = /<(item|entry)[\s\S]*?<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < 12) {
    const block = m[0];
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block)?.[1] ?? "";
    const desc =
      /<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/i.exec(block)?.[2] ?? "";
    const line = `${htmlToText(title)} — ${htmlToText(desc).slice(0, 180)}`.trim();
    if (line.length > 3) items.push(`• ${line}`);
  }
  return items.join("\n");
}

/** Normalize a GitHub repo URL to its README via the GitHub API. */
function githubReadmeUrl(url: string): string | null {
  const m = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(url);
  if (!m) return null;
  return `https://api.github.com/repos/${m[1]}/${m[2].replace(/\.git$/, "")}/readme`;
}

async function fetchOne(source: KnowledgeSource): Promise<string | null> {
  const cached = cache.get(source.url);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.text;

  try {
    let url = source.url;
    const headers: Record<string, string> = {
      "User-Agent": "bowyer-agent-runtime",
    };

    if (source.type === "github") {
      const api = githubReadmeUrl(source.url);
      if (api) {
        url = api;
        headers.Accept = "application/vnd.github.raw+json";
        if (process.env.GITHUB_TOKEN) {
          headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }
      }
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const raw = await res.text();
    let text: string;
    if (source.type === "rss") {
      text = rssToText(raw) || htmlToText(raw);
    } else if (source.type === "github") {
      text = raw.replace(/\s+/g, " ").trim(); // raw markdown README
    } else {
      text = htmlToText(raw);
    }

    text = text.slice(0, MAX_CHARS_PER_SOURCE);
    if (text.length < 40) return null; // not useful

    cache.set(source.url, { at: Date.now(), text });
    return text;
  } catch {
    return null;
  }
}

/**
 * Fetch all of a business's knowledge sources and format them as a context
 * block for the system prompt. Returns "" when there are no usable sources.
 */
export async function buildSourceContext(slug: string): Promise<string> {
  const sources = getAgentSources(slug).slice(0, MAX_SOURCES);
  if (sources.length === 0) return "";

  const results = await Promise.all(
    sources.map(async (s) => {
      const text = await fetchOne(s);
      if (!text) return null;
      return `--- Source (${s.type}): ${s.url} ---\n${text}`;
    })
  );

  const blocks = results.filter(Boolean);
  if (blocks.length === 0) return "";

  return [
    "You have live knowledge sources connected. Fetched moments ago:",
    ...blocks,
    "Ground your analysis in this source material where relevant, and cite the source when you use it.",
  ].join("\n\n");
}
