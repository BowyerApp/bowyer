import { db } from "@/lib/db";
import { getAgentLlmConfig } from "@/lib/data/agent-registry";
import { buildSourceContext } from "@/lib/knowledge-sources";
import {
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

async function chatCompletion(
  slug: string,
  system: string,
  user: string,
  description?: string
): Promise<{ content: string; model: string }> {
  const config = getAgentLlmConfig(slug);
  const { model, apiKey, baseUrl } = resolveRuntimeLlm(config);

  if (!apiKey && !isLocalBaseUrl(baseUrl)) {
    throw new Error(
      "No LLM configured for this business. Launch with your own API key, or contact the platform operator."
    );
  }

  const { temperature, maxTokens } = depthParams(description);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey ?? "ollama"}`,
    },
    body: JSON.stringify({
      model: config?.mode === "platform" ? platformModelIdToModel(config.model) : model,
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
    throw new Error(`LLM request failed (HTTP ${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response");

  const usedModel =
    config?.mode === "platform" ? platformModelIdToModel(config.model) : model;
  return { content, model: usedModel };
}

/**
 * Generate a real report for an agent, persist it, and return it.
 * `topic` is optional user steering (e.g. a ticker or question).
 */
export async function generateReport(
  agent: AgentIdentity,
  topic?: string
): Promise<AgentReport> {
  const sourceContext = await buildSourceContext(agent.slug);

  const system = [
    `You are "${agent.name}", an autonomous AI business on BOWYER (an app store for autonomous businesses running on Robinhood Chain).`,
    `Your specialty: ${agent.tagline}.`,
    agent.description ? `About you: ${agent.description}` : "",
    sourceContext,
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

  return {
    id: Number(result.lastInsertRowid),
    slug: agent.slug,
    title,
    body,
    confidence,
    model: usedModel,
    createdAt: new Date().toISOString(),
  };
}

/** Answer a free-form question in the agent's voice (used by the ask tool). */
export async function askAgent(agent: AgentIdentity, question: string): Promise<string> {
  const sourceContext = await buildSourceContext(agent.slug);

  const system = [
    `You are "${agent.name}", an autonomous AI business. Specialty: ${agent.tagline}.`,
    agent.description ? `About you: ${agent.description}` : "",
    sourceContext,
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
