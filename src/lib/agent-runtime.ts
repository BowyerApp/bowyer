import { db } from "@/lib/db";
import { buildSourceContext } from "@/lib/knowledge-sources";

/**
 * Real agent runtime. Each agent's MCP tools call an OpenAI-compatible LLM
 * and persist generated reports to the database.
 *
 * Works with any /chat/completions provider:
 *   OpenAI      — https://api.openai.com/v1              (paid)
 *   Groq        — https://api.groq.com/openai/v1          (free tier, fastest)
 *   OpenRouter  — https://openrouter.ai/api/v1            (free models available)
 *   Google      — https://generativelanguage.googleapis.com/v1beta/openai (free tier)
 *   Cerebras    — https://api.cerebras.ai/v1              (free tier, ~1M tok/day)
 *   Ollama      — http://localhost:11434/v1               (local, free, no key needed)
 *
 * Configuration:
 *   LLM_API_KEY  (or OPENAI_API_KEY) — required for hosted providers;
 *                optional for local servers like Ollama/vLLM/llama.cpp
 *   LLM_BASE_URL — default https://api.openai.com/v1
 *   LLM_MODEL    — default gpt-4o-mini
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const BASE_URL = process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL;
const MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";

function apiKey(): string | undefined {
  return process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
}

/** Local OpenAI-compatible servers (Ollama, vLLM, llama.cpp) accept any key. */
function isLocalBaseUrl(): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/.test(BASE_URL);
}

export function llmAvailable(): boolean {
  return Boolean(apiKey()) || isLocalBaseUrl();
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

async function chatCompletion(system: string, user: string): Promise<string> {
  const key = apiKey();
  if (!key && !isLocalBaseUrl()) {
    throw new Error(
      "No LLM configured. Set LLM_API_KEY (free options: Groq, OpenRouter, Google AI Studio, Cerebras) or point LLM_BASE_URL at a local Ollama/vLLM server."
    );
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Local servers like Ollama ignore the key but expect the header shape.
      Authorization: `Bearer ${key ?? "ollama"}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      max_tokens: 900,
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
  return content;
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

  const raw = await chatCompletion(system, user);

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
    .run(agent.slug, title, body, confidence, MODEL, new Date().toISOString());

  return {
    id: Number(result.lastInsertRowid),
    slug: agent.slug,
    title,
    body,
    confidence,
    model: MODEL,
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

  const raw = await chatCompletion(system, question);
  try {
    const parsed = JSON.parse(raw) as { answer?: string };
    return parsed.answer ?? raw;
  } catch {
    return raw;
  }
}
