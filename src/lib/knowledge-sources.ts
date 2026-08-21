import { getAgentSources, type KnowledgeSource } from "@/lib/data/agent-registry";
import { getAccessTokenForAgent, getGitHubTokenForAgent } from "@/lib/oauth/store";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Live knowledge ingestion. When a business was launched with sources,
 * the runtime fetches them and injects the content into the LLM context.
 *
 * Content is cached in memory for 10 minutes per URL to keep tool calls fast.
 */

const TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_CHARS_PER_SOURCE = 2_500;
const MAX_SOURCES = 4;
const NOTION_VERSION = "2022-06-28";

const cache = new Map<string, { at: number; text: string }>();

export const SUPPORTED_SOURCE_TYPES = [
  "website",
  "github",
  "rss",
  "notion",
  "discord",
  "x",
  "pdf",
  "wallet",
  "telegram",
  "api",
] as const;

export function isValidSourceUrl(url: string): boolean {
  if (/^notion:\/\/page\//.test(url)) return true;
  if (/^discord:\/\/channel\/\d+\/\d+/.test(url)) return true;
  if (/^x:\/\/user\/[A-Za-z0-9_]{1,15}$/.test(url)) return true;
  if (/^wallet:\/\/0x[0-9a-fA-F]{40}$/.test(url)) return true;
  if (/^telegram:\/\/channel\/[A-Za-z0-9_]{4,32}$/.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

/** Reject local/private destinations before a source is fetched server-side. */
export async function isSafePublicHttpUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return false;
  if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost")) return false;
  try {
    const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
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

function notionPageId(url: string): string | null {
  const m = /^notion:\/\/page\/(.+)$/.exec(url);
  return m?.[1] ?? null;
}

function discordChannelIds(url: string): { channelId: string } | null {
  const m = /^discord:\/\/channel\/(\d+)\/(\d+)$/.exec(url);
  if (!m) return null;
  return { channelId: m[2] };
}

function xUsername(url: string): string | null {
  const m = /^x:\/\/user\/([A-Za-z0-9_]{1,15})$/.exec(url);
  return m?.[1] ?? null;
}

async function firecrawlScrape(url: string, slug?: string): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  if (slug) {
    const { usageAllowed, recordUsage } = await import("@/lib/usage");
    if (!usageAllowed(slug, "scrape")) return null;
  }
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { markdown?: string } };
    const md = json.data?.markdown?.replace(/\s+/g, " ").trim();
    if (md && md.length >= 40) {
      if (slug) {
        const { recordUsage } = await import("@/lib/usage");
        recordUsage(slug, "scrape");
      }
      return md;
    }
    return null;
  } catch {
    return null;
  }
}

function blockToText(block: {
  type: string;
  paragraph?: { rich_text?: { plain_text?: string }[] };
  heading_1?: { rich_text?: { plain_text?: string }[] };
  heading_2?: { rich_text?: { plain_text?: string }[] };
  heading_3?: { rich_text?: { plain_text?: string }[] };
  bulleted_list_item?: { rich_text?: { plain_text?: string }[] };
  numbered_list_item?: { rich_text?: { plain_text?: string }[] };
  quote?: { rich_text?: { plain_text?: string }[] };
  code?: { rich_text?: { plain_text?: string }[] };
}): string {
  const rich =
    block.paragraph?.rich_text ??
    block.heading_1?.rich_text ??
    block.heading_2?.rich_text ??
    block.heading_3?.rich_text ??
    block.bulleted_list_item?.rich_text ??
    block.numbered_list_item?.rich_text ??
    block.quote?.rich_text ??
    block.code?.rich_text ??
    [];
  return rich.map((r) => r.plain_text ?? "").join("");
}

async function fetchNotionPage(url: string, token: string): Promise<string | null> {
  const pageId = notionPageId(url);
  if (!pageId) return null;

  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=50`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { results?: Parameters<typeof blockToText>[0][] };
  const lines = (json.results ?? [])
    .map((b) => blockToText(b))
    .filter((t) => t.trim().length > 0);
  return lines.join("\n").trim() || null;
}

async function fetchDiscordChannel(url: string): Promise<string | null> {
  const parsed = discordChannelIds(url);
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!parsed || !botToken) return null;

  const res = await fetch(
    `https://discord.com/api/channels/${parsed.channelId}/messages?limit=20`,
    {
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  );
  if (!res.ok) return null;

  const messages = (await res.json()) as { content?: string; author?: { username?: string } }[];
  const lines = messages
    .reverse()
    .map((m) => {
      const author = m.author?.username ?? "user";
      const content = (m.content ?? "").replace(/\s+/g, " ").trim();
      return content ? `@${author}: ${content}` : "";
    })
    .filter(Boolean);
  return lines.join("\n").trim() || null;
}

async function fetchXTimeline(url: string, token: string): Promise<string | null> {
  const username = xUsername(url);
  if (!username) return null;

  const userRes = await fetch(
    `https://api.twitter.com/2/users/by/username/${username}?user.fields=username`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  );
  if (!userRes.ok) return null;
  const userJson = (await userRes.json()) as { data?: { id: string } };
  if (!userJson.data?.id) return null;

  const tweetsRes = await fetch(
    `https://api.twitter.com/2/users/${userJson.data.id}/tweets?max_results=10&tweet.fields=created_at,text`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  );
  if (!tweetsRes.ok) return null;

  const tweetsJson = (await tweetsRes.json()) as {
    data?: { text?: string; created_at?: string }[];
  };
  const lines = (tweetsJson.data ?? []).map((t) => {
    const date = t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : "";
    return date ? `[${date}] ${t.text ?? ""}` : (t.text ?? "");
  });
  return lines.join("\n").trim() || null;
}

const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_BASE?.trim() || "https://robinhoodchain.blockscout.com/api/v2";
const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** Extract readable text from a hosted PDF via unpdf (serverless-safe pdf.js build). */
async function fetchPdfText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "bowyer-agent-runtime" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100 || buf.byteLength > MAX_PDF_BYTES) return null;
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(doc, { mergePages: true });
    const cleaned = (Array.isArray(text) ? text.join(" ") : text).replace(/\s+/g, " ").trim();
    return cleaned.length >= 40 ? cleaned : null;
  } catch {
    return null;
  }
}

/** Live wallet snapshot from Blockscout: balance, top tokens, recent transfers. */
async function fetchWalletSnapshot(url: string): Promise<string | null> {
  const m = /^wallet:\/\/(0x[0-9a-fA-F]{40})$/.exec(url);
  if (!m) return null;
  const address = m[1].toLowerCase();
  const opts = {
    headers: { "User-Agent": "bowyer-agent-runtime" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };
  try {
    const [infoRes, tokensRes, transfersRes] = await Promise.all([
      fetch(`${BLOCKSCOUT_API}/addresses/${address}`, opts),
      fetch(`${BLOCKSCOUT_API}/addresses/${address}/tokens?type=ERC-20`, opts),
      fetch(`${BLOCKSCOUT_API}/addresses/${address}/token-transfers?type=ERC-20`, opts),
    ]);
    if (!infoRes.ok) return null;

    const info = (await infoRes.json()) as { coin_balance?: string };
    const eth = Number(info.coin_balance ?? 0) / 1e18;
    const lines = [`Wallet ${address}`, `Native balance: ${eth.toFixed(4)} ETH`];

    if (tokensRes.ok) {
      const tokens = (await tokensRes.json()) as {
        items?: { token?: { symbol?: string; decimals?: string }; value?: string }[];
      };
      const holdings = (tokens.items ?? [])
        .map((t) => ({
          symbol: t.token?.symbol ?? "?",
          amount: Number(t.value ?? 0) / 10 ** Number(t.token?.decimals ?? 18),
        }))
        .filter((t) => t.amount > 0.000001)
        .slice(0, 8);
      if (holdings.length > 0) {
        lines.push(
          "Token holdings: " +
            holdings
              .map((h) => `${h.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${h.symbol}`)
              .join(", ")
        );
      }
    }

    if (transfersRes.ok) {
      const transfers = (await transfersRes.json()) as {
        items?: {
          timestamp?: string;
          to?: { hash?: string };
          token?: { symbol?: string; decimals?: string };
          total?: { value?: string };
        }[];
      };
      const recent = (transfers.items ?? []).slice(0, 10).map((t) => {
        const dir = (t.to?.hash ?? "").toLowerCase() === address ? "IN" : "OUT";
        const amount = Number(t.total?.value ?? 0) / 10 ** Number(t.token?.decimals ?? 18);
        const day = (t.timestamp ?? "").slice(0, 10);
        return `${day} ${dir} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${t.token?.symbol ?? "?"}`;
      });
      if (recent.length > 0) lines.push("Recent transfers:", ...recent.map((r) => `• ${r}`));
    }

    return lines.join("\n");
  } catch {
    return null;
  }
}

/** Public Telegram channel posts via the t.me preview page — no bot required. */
async function fetchTelegramChannel(url: string): Promise<string | null> {
  const m = /^telegram:\/\/channel\/([A-Za-z0-9_]{4,32})$/.exec(url);
  if (!m) return null;
  try {
    const res = await fetch(`https://t.me/s/${m[1]}`, {
      headers: { "User-Agent": DOWNLOAD_UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const posts: string[] = [];
    const postRe = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match: RegExpExecArray | null;
    while ((match = postRe.exec(html))) {
      const text = htmlToText(match[1]);
      if (text.length > 3) posts.push(`• ${text.slice(0, 240)}`);
    }
    // t.me renders oldest-first; keep the latest posts.
    const latest = posts.slice(-15);
    return latest.length > 0 ? latest.join("\n") : null;
  } catch {
    return null;
  }
}

/** Custom API endpoint: JSON gets compacted, anything else is stripped to text. */
async function fetchCustomApi(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "bowyer-agent-runtime", Accept: "application/json, text/*;q=0.8" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("json") || /^[[{]/.test(raw.trim())) {
      try {
        return JSON.stringify(JSON.parse(raw)).slice(0, MAX_CHARS_PER_SOURCE);
      } catch {
        /* fall through to text */
      }
    }
    const text = htmlToText(raw);
    return text.length >= 20 ? text : null;
  } catch {
    return null;
  }
}

const DOWNLOAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchOne(source: KnowledgeSource, slug?: string): Promise<string | null> {
  const cacheKey = `${slug ?? "public"}:${source.type}:${source.url}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.text;

  if (source.type === "notion" && slug) {
    const token = getAccessTokenForAgent(slug, "notion");
    if (token) {
      const text = (await fetchNotionPage(source.url, token))?.slice(0, MAX_CHARS_PER_SOURCE);
      if (text && text.length >= 20) {
        cache.set(cacheKey, { at: Date.now(), text });
        return text;
      }
    }
  }

  if (source.type === "discord") {
    const text = (await fetchDiscordChannel(source.url))?.slice(0, MAX_CHARS_PER_SOURCE);
    if (text && text.length >= 20) {
      cache.set(cacheKey, { at: Date.now(), text });
      return text;
    }
  }

  if (source.type === "x" && slug) {
    const token = getAccessTokenForAgent(slug, "x");
    if (token) {
      const text = (await fetchXTimeline(source.url, token))?.slice(0, MAX_CHARS_PER_SOURCE);
      if (text && text.length >= 20) {
        cache.set(cacheKey, { at: Date.now(), text });
        return text;
      }
    }
  }

  if (source.type === "pdf") {
    const text = (await fetchPdfText(source.url))?.slice(0, MAX_CHARS_PER_SOURCE);
    if (text) cache.set(cacheKey, { at: Date.now(), text });
    return text ?? null;
  }

  if (source.type === "wallet") {
    const text = (await fetchWalletSnapshot(source.url))?.slice(0, MAX_CHARS_PER_SOURCE);
    if (text) cache.set(cacheKey, { at: Date.now(), text });
    return text ?? null;
  }

  if (source.type === "telegram") {
    const text = (await fetchTelegramChannel(source.url))?.slice(0, MAX_CHARS_PER_SOURCE);
    if (text) cache.set(cacheKey, { at: Date.now(), text });
    return text ?? null;
  }

  if (source.type === "api") {
    const text = (await fetchCustomApi(source.url))?.slice(0, MAX_CHARS_PER_SOURCE);
    if (text) cache.set(cacheKey, { at: Date.now(), text });
    return text ?? null;
  }

  if (source.type === "website") {
    const md = await firecrawlScrape(source.url, slug);
    if (md) {
      const text = md.slice(0, MAX_CHARS_PER_SOURCE);
      cache.set(cacheKey, { at: Date.now(), text });
      return text;
    }
  }

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
        const token = slug ? getGitHubTokenForAgent(slug) : process.env.GITHUB_TOKEN?.trim();
        if (token) headers.Authorization = `Bearer ${token}`;
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
      text = raw.replace(/\s+/g, " ").trim();
    } else {
      text = htmlToText(raw);
    }

    text = text.slice(0, MAX_CHARS_PER_SOURCE);
    if (text.length < 40) return null;

    cache.set(cacheKey, { at: Date.now(), text });
    return text;
  } catch {
    return null;
  }
}

export async function buildSourceContext(slug: string): Promise<string> {
  const sources = getAgentSources(slug).slice(0, MAX_SOURCES);
  if (sources.length === 0) return "";

  const results = await Promise.all(
    sources.map(async (s) => {
      const text = await fetchOne(s, slug);
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
