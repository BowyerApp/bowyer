import { db } from "@/lib/db";
import { getAgentLlmConfig } from "@/lib/data/agent-registry";
import { buildSourceContext } from "@/lib/knowledge-sources";
import { formatChainContext, scanChain } from "@/lib/chain-scanner";
import {
  deepResearch,
  formatDeepResearchContext,
  formatSearchContext,
  webSearch,
  webSearchAvailable,
} from "@/lib/web-search";
import { recordUsage, usageAllowed } from "@/lib/usage";
import { notifyReportPublished } from "@/lib/telegram";
import {
  fallbackRuntimeLlm,
  isLocalBaseUrl,
  llmConfigured,
  platformModelIdToModel,
  resolveRuntimeLlm,
  type AgentLlmConfig,
} from "@/lib/llm-config";

/**
 * Real agent runtime. Each agent's MCP tools call an OpenAI-compatible LLM
 * and persist generated reports to the database.
 *
 * Per-business LLM config (platform model or founder's API key) is read from
 * the agents table. Catalog agents fall back to server env vars.
 */

export function llmAvailable(slug?: string): boolean {
  const config = slug ? getAgentLlmConfig(slug) : null;
  return llmConfigured(config);
}

export interface AgentIdentity {
  slug: string;
  name: string;
  tagline: string;
  description?: string;
}

export interface AgentReport {
  id: number;
  slug: string;
  title: string;
  body: string;
  confidence: number | null;
  model: string | null;
  createdAt: string;
}

interface ReportRow {
  id: number;
  slug: string;
  title: string;
  body: string;
  confidence: number | null;
  model: string | null;
  created_at: string;
}

function rowToReport(row: ReportRow): AgentReport {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    confidence: row.confidence,
    model: row.model,
    createdAt: row.created_at,
  };
}

export function getStoredReports(slug: string, limit = 5): AgentReport[] {
  const rows = db()
    .prepare("SELECT * FROM reports WHERE slug = ? ORDER BY created_at DESC LIMIT ?")
    .all(slug, Math.min(limit, 20)) as ReportRow[];
  return rows.map(rowToReport);
}

function depthParams(description?: string): { temperature: number; maxTokens: number } {
  if (/Reasoning depth: deep/i.test(description ?? "")) {
    return { temperature: 0.4, maxTokens: 1400 };
  }
  if (/Reasoning depth: fast/i.test(description ?? "")) {
    return { temperature: 0.85, maxTokens: 600 };
  }
  return { temperature: 0.7, maxTokens: 900 };
}

async function callLlm(
  model: string,
  apiKey: string | undefined,
  baseUrl: string,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number
): Promise<{ content: string; model: string }> {
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
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`LLM request failed (HTTP ${res.status}): ${detail.slice(0, 200)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response");
  return { content, model };
}

async function chatCompletion(
  slug: string,
  system: string,
  user: string,
  description?: string
): Promise<{ content: string; model: string }> {
  const config = getAgentLlmConfig(slug);
  const primary = resolveRuntimeLlm(config);
  const usedModel =
    config?.mode === "platform" ? platformModelIdToModel(config.model) : primary.model;

  if (!primary.apiKey && !isLocalBaseUrl(primary.baseUrl)) {
    throw new Error(
      "No LLM configured for this business. Launch with your own API key, or contact the platform operator."
    );
  }

  const { temperature, maxTokens } = depthParams(description);

  if (!usageAllowed(slug, "llm")) {
    throw new Error("Daily LLM quota reached for this business. Try again tomorrow.");
  }

  try {
    const result = await callLlm(
      usedModel,
      primary.apiKey,
      primary.baseUrl,
      system,
      user,
      temperature,
      maxTokens
    );
    recordUsage(slug, "llm");
    return result;
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    const fallback = config?.mode !== "custom" ? fallbackRuntimeLlm() : null;
    if (fallback && status && [429, 502, 503, 529].includes(status)) {
      const fb = await callLlm(
        fallback.model,
        fallback.apiKey,
        fallback.baseUrl,
        system,
        user,
        temperature,
        maxTokens
      );
      recordUsage(slug, "llm");
      return fb;
    }
    throw err;
  }
}

/** Agents that run the multi-query deep-research pipeline. */
function isResearchAgent(agent: AgentIdentity): boolean {
  return (
    agent.slug === "gpt-researcher" ||
    /Reasoning depth: deep/i.test(agent.description ?? "")
  );
}

/**
 * Build the live grounding context for a report or answer:
 * — Whale Hunter gets a real Robinhood Chain scan (recent blocks over RPC)
 * — research agents get a multi-query deep-research pass (Tavily)
 * — everyone else gets a single live web search on the topic
 */
async function buildLiveContext(agent: AgentIdentity, query: string): Promise<string> {
  const parts: string[] = [];

  if (agent.slug === "whale-hunter") {
    try {
      parts.push(formatChainContext(await scanChain()));
    } catch {
      // Chain scan unavailable — the agent still has web search below.
    }
  }

  if (webSearchAvailable()) {
    if (isResearchAgent(agent)) {
      const groups = await deepResearch(query, [
        `${query} latest news`,
        `${query} analysis data`,
      ], agent.slug);
      const ctx = formatDeepResearchContext(groups);
      if (ctx) parts.push(ctx);
    } else {
      const results = await webSearch(query, 5, agent.slug);
      const ctx = formatSearchContext(query, results);
      if (ctx) parts.push(ctx);
    }
  }

  return parts.join("\n\n");
}

/**
 * Generate a real report for an agent, persist it, and return it.
 * `topic` is optional user steering (e.g. a ticker or question).
 */
export async function generateReport(
  agent: AgentIdentity,
  topic?: string
): Promise<AgentReport> {
  const searchQuery = topic?.trim() || `${agent.tagline} latest developments`;
  const [sourceContext, liveContext] = await Promise.all([
    buildSourceContext(agent.slug),
    buildLiveContext(agent, searchQuery),
  ]);

  const system = [
    `You are "${agent.name}", an autonomous AI business on BOWYER (an app store for autonomous businesses running on Robinhood Chain).`,
    `Your specialty: ${agent.tagline}.`,
    agent.description ? `About you: ${agent.description}` : "",
    sourceContext,
    liveContext,
    "Write a concise, professional intelligence report for your paying subscribers.",
    "Respond ONLY with a JSON object of the shape:",
    `{"title": string, "body": string (markdown, 150-300 words), "confidence": number (0-1, your honest confidence in the analysis)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const user = topic
    ? `Subscriber request: produce your next report focused on: ${topic}`
    : "Produce your next scheduled report on the most relevant development in your domain right now.";

  const { content: raw, model: usedModel } = await chatCompletion(
    agent.slug,
    system,
    user,
    agent.description
  );

  let parsed: { title?: string; body?: string; confidence?: number };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { title: `${agent.name} report`, body: raw, confidence: 0.5 };
  }

  const title = String(parsed.title ?? `${agent.name} report`).slice(0, 200);
  const body = String(parsed.body ?? raw);
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));

  const result = db()
    .prepare(
      `INSERT INTO reports (slug, title, body, confidence, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(agent.slug, title, body, confidence, usedModel, new Date().toISOString());

  const report = {
    id: Number(result.lastInsertRowid),
    slug: agent.slug,
    title,
    body,
    confidence,
    model: usedModel,
    createdAt: new Date().toISOString(),
  };

  notifyReportPublished(agent.slug, title, body).catch(() => {});

  return report;
}

/** Answer a free-form question in the agent's voice (used by the ask tool). */
export async function askAgent(agent: AgentIdentity, question: string): Promise<string> {
  const [sourceContext, liveContext] = await Promise.all([
    buildSourceContext(agent.slug),
    buildLiveContext(agent, question),
  ]);

  const system = [
    `You are "${agent.name}", an autonomous AI business. Specialty: ${agent.tagline}.`,
    agent.description ? `About you: ${agent.description}` : "",
    sourceContext,
    liveContext,
    "Answer the subscriber's question directly and concisely in your domain of expertise.",
    `Respond ONLY with a JSON object: {"answer": string}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { content: raw } = await chatCompletion(
    agent.slug,
    system,
    question,
    agent.description
  );
  try {
    const parsed = JSON.parse(raw) as { answer?: string };
    return parsed.answer ?? raw;
  } catch {
    return raw;
  }
}

/** Validate a custom API key with a minimal completion (launch-time check). */
export async function validateCustomLlm(config: AgentLlmConfig): Promise<boolean> {
  if (config.mode !== "custom" || !config.apiKey) return false;
  const { model, apiKey, baseUrl } = resolveRuntimeLlm(config);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with JSON: {\"ok\":true}" }],
        max_tokens: 16,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
