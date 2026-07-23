import { db } from "@/lib/db";
import {
  getAgentLineage,
  getAgentLlmConfig,
  getAgentOwnerAddress,
  listPremiumBusinessSlugsForOwner,
} from "@/lib/data/agent-registry";
import { buildSourceContext } from "@/lib/knowledge-sources";
import { formatChainContext, scanChain } from "@/lib/chain-scanner";
import { getMemeRadar } from "@/lib/meme-radar";
import { getDeskSignals, getPremiumHistory, recordQuoteSnapshots } from "@/lib/desk-signals";
import { getStockTokenQuotes } from "@/lib/stock-tokens";
import {
  deepResearch,
  formatDeepResearchContext,
  formatSearchContext,
  webSearch,
  webSearchAvailable,
} from "@/lib/web-search";
import { platformLlmAllowed, recordPlatformLlm, recordUsage, usageAllowed } from "@/lib/usage";
import { deliverReportWebhooks } from "@/lib/mcp-webhooks";
import { createSignalFromReport } from "@/lib/signals";
import {
  fallbackRuntimeLlm,
  isLocalBaseUrl,
  isPremiumPlatformModelId,
  llmConfigured,
  platformModelIdToModel,
  resolveRuntimeLlm,
  type AgentLlmConfig,
} from "@/lib/llm-config";
import { getHolderTierStatus } from "@/lib/token-gate";
import { getAgentPersona } from "@/lib/agent-personas";

/**
 * Real agent runtime. Each agent's MCP tools call an OpenAI-compatible LLM
 * and persist generated reports to the database.
 *
 * Per-business LLM config (platform model or founder's API key) is read from
 * the agents table. Catalog agents fall back to server env vars.
 */

export function llmAvailable(slug?: string): boolean {
  const config = slug ? (getAgentLlmConfig(slug) ?? CATALOG_PREMIUM_LLM[slug] ?? null) : null;
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

/** Total reports ever published by an agent (not capped like getStoredReports). */
export function countStoredReports(slug: string): number {
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM reports WHERE slug = ?")
    .get(slug) as { n: number };
  return row.n;
}

export function getStoredReport(slug: string, id: number): AgentReport | null {
  const row = db()
    .prepare("SELECT * FROM reports WHERE slug = ? AND id = ?")
    .get(slug, id) as ReportRow | undefined;
  return row ? rowToReport(row) : null;
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

export type ChatTurn = { role: "user" | "assistant"; content: string };

async function callLlm(
  model: string,
  apiKey: string | undefined,
  baseUrl: string,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
  history: ChatTurn[] = []
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
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
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
    // Full provider payload goes to server logs only — org ids, quota
    // internals, and raw provider JSON must never reach a subscriber.
    console.error(`[llm] ${model} @ ${baseUrl} -> HTTP ${res.status}: ${detail.slice(0, 500)}`);
    const friendly =
      res.status === 429
        ? "The model is at capacity right now — try again in a moment."
        : res.status === 401 || res.status === 403
          ? "The model provider rejected this business's credentials."
          : `The model request failed (HTTP ${res.status}). Try again.`;
    const err = new Error(friendly) as Error & { status?: number };
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

/**
 * Platform-owned flagship businesses pinned to premium frontier models.
 * These are BOWYER Labs agents (no creator wallet), so the $BOWYER holder
 * gate does not apply — the platform pays for its own flagships.
 */
const CATALOG_PREMIUM_LLM: Record<string, AgentLlmConfig> = {
  // Note: the gpt-5.2-pro tier deliberates too long for scheduled report loops.
  "atlas-macro": { mode: "platform", model: "gpt-5.4" },
  "nyx-forensics": { mode: "platform", model: "claude-opus" },
  "vega-narrative": { mode: "platform", model: "grok-3" },
};

async function effectiveLlmConfig(
  slug: string,
  config: AgentLlmConfig | null
): Promise<AgentLlmConfig | null> {
  if (config?.mode !== "platform" || !isPremiumPlatformModelId(config.model)) return config;
  if (CATALOG_PREMIUM_LLM[slug]) return config;
  // Incubator-born businesses are platform-owned: the platform pays for
  // their frontier model, same as the flagships.
  if (getAgentLineage(slug)) return config;
  const owner = getAgentOwnerAddress(slug);
  const tier = await getHolderTierStatus(owner);
  if (tier.tier !== "none") {
    if (tier.premiumBusinessLimit === null) return config;
    // Earliest-launched premium businesses keep their slot when over limit.
    const rank = listPremiumBusinessSlugsForOwner(owner ?? "", isPremiumPlatformModelId).indexOf(
      slug
    );
    if (rank !== -1 && rank < tier.premiumBusinessLimit) return config;
  }
  return { mode: "platform", model: "balanced" };
}

async function chatCompletion(
  slug: string,
  system: string,
  user: string,
  description?: string,
  history: ChatTurn[] = []
): Promise<{ content: string; model: string }> {
  const rawConfig = getAgentLlmConfig(slug) ?? CATALOG_PREMIUM_LLM[slug] ?? null;
  const config = await effectiveLlmConfig(slug, rawConfig);
  const primary = resolveRuntimeLlm(config);
  // resolveRuntimeLlm already returns the provider-correct model id (e.g. the
  // OpenRouter "vendor/model" form for premium) — always request with it.
  const usedModel = primary.model;

  if (!primary.apiKey && !isLocalBaseUrl(primary.baseUrl)) {
    throw new Error(
      "No LLM configured for this business. Launch with your own API key, or contact the platform operator."
    );
  }

  const { temperature, maxTokens } = depthParams(description);

  if (!usageAllowed(slug, "llm")) {
    throw new Error("Daily LLM quota reached for this business. Try again tomorrow.");
  }
  const usesPlatformModel = config?.mode !== "custom";
  if (usesPlatformModel && !platformLlmAllowed()) {
    throw new Error("Platform model capacity is temporarily full. Try again shortly or use your own API key.");
  }
  if (usesPlatformModel) recordPlatformLlm();

  try {
    const result = await callLlm(
      usedModel,
      primary.apiKey,
      primary.baseUrl,
      system,
      user,
      temperature,
      maxTokens,
      history
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
        maxTokens,
        history
      );
      recordUsage(slug, "llm");
      return fb;
    }
    throw err;
  }
}

/**
 * Parse a JSON object from raw LLM output. Some providers (notably Anthropic
 * via OpenRouter) wrap JSON in markdown code fences or add surrounding prose
 * even when asked for JSON only.
 */
function parseJsonLoose<T>(raw: string): T | null {
  const attempts = [raw.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) attempts.unshift(fenced[1].trim());
  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    attempts.push(raw.slice(braceStart, braceEnd + 1));
  }
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed as T;
    } catch {
      /* try next candidate */
    }
  }
  return null;
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
  if (agent.slug === "hood-meme-radar") {
    try {
      const radar = await getMemeRadar();
      parts.push(
        [
          `Live Hood Meme Radar scan (Robinhood Chain ${radar.chainId}, fetched ${radar.scannedAt}):`,
          `• Blocks scanned: ${radar.blockRange.from}–${radar.blockRange.to} (${radar.blockRange.blocksScanned} blocks)`,
          `• ${radar.launchCandidates.length} recent contract deployments, ${radar.clusters.length} direct funding clusters`,
          ...radar.launchCandidates.slice(0, 6).map((item) => {
            const label = item.token?.symbol
              ? `${item.token.symbol}${item.token.name ? ` (${item.token.name})` : ""}`
              : "unidentified contract";
            const marketLine = item.market
              ? ` · price $${item.market.priceUsd ?? "?"} · liq $${item.market.liquidityUsd?.toLocaleString() ?? "?"} · 24h vol $${item.market.volume24h?.toLocaleString() ?? "?"} · ${item.market.url}`
              : " · no DEX pool found yet";
            return `• ${item.lifecycle === "trading" ? "Trading" : "Forming"}: ${label} at ${item.contractAddress ?? "address pending"} · deployed by ${item.deployer.slice(0, 10)}… block ${item.blockNumber} · score ${item.score}/100${marketLine}`;
          }),
          ...radar.clusters.slice(0, 5).map((item) => `• Funding cluster: ${item.funder.slice(0, 10)}… → ${item.recipients} addresses · ${item.totalEth} ETH · score ${item.score}/100`),
          "Cite the contract addresses, block range, and market figures above when relevant. Holder distribution is available per-token via the scan_token tool; dev-sell tracing is NOT available — say so if asked. Never invent liquidity, holders, or sellability facts beyond this data.",
        ].join("\n")
      );
    } catch {
      // A missing RPC must not cause reports to fabricate or fail.
    }
  }
  if (agent.slug === "nyx-forensics") {
    try {
      const [chain, radar] = await Promise.all([scanChain(), getMemeRadar()]);
      parts.push(formatChainContext(chain));
      parts.push(
        [
          `Recent deployment and funding activity (blocks ${radar.blockRange.from}–${radar.blockRange.to}):`,
          ...radar.launchCandidates.slice(0, 6).map((item) => {
            const label = item.token?.symbol
              ? `${item.token.symbol}${item.token.name ? ` (${item.token.name})` : ""}`
              : "unidentified contract";
            return `• ${label} at ${item.contractAddress ?? "address pending"} · deployer ${item.deployer.slice(0, 10)}… · block ${item.blockNumber} · risk score ${item.score}/100`;
          }),
          ...radar.clusters.slice(0, 5).map((item) => `• Funding cluster: ${item.funder.slice(0, 10)}… → ${item.recipients} addresses · ${item.totalEth} ETH`),
          "Anchor every forensic claim to the addresses, blocks, and scores above. Use 'consistent with' language — never assert intent you cannot prove from the data. Dev-sell tracing is not available; say so if asked.",
        ].join("\n")
      );
    } catch {
      // RPC unavailable — web search below still grounds the report.
    }
  }
  if (agent.slug === "atlas-macro") {
    try {
      const quotes = await getStockTokenQuotes();
      const lines = quotes
        .filter((q) => q.referencePriceUsd != null)
        .map(
          (q) =>
            `• ${q.symbol} (${q.name}): equity spot $${q.referencePriceUsd!.toFixed(2)}${q.premiumDiscountPct != null ? ` · token trades ${q.premiumDiscountPct >= 0 ? "+" : ""}${q.premiumDiscountPct.toFixed(2)}% vs spot on-chain` : ""}`
        );
      if (lines.length > 0) {
        parts.push(
          [
            "Live Stock Token universe on Robinhood Chain (map your macro analysis onto these):",
            ...lines,
            "Only reference the prices above — never invent levels.",
          ].join("\n")
        );
      }
    } catch {
      // Desk data unavailable — deep research below still grounds the report.
    }
  }
  if (agent.slug === "desk-arb-radar") {
    try {
      const quotes = await getStockTokenQuotes();
      // The radar's own polling keeps premium history building even when
      // nobody has the desk page open.
      recordQuoteSnapshots(quotes);
      const signals = getDeskSignals();
      const lines = [
        `Live Stock Token desk data (Robinhood Chain 4663, fetched ${new Date().toISOString()}):`,
        ...quotes
          .filter((q) => q.premiumDiscountPct != null)
          .map(
            (q) =>
              `• ${q.symbol} (${q.name}): DEX $${q.dexPriceUsd?.toFixed(2)} vs equity spot $${q.referencePriceUsd?.toFixed(2)} → ${q.premiumDiscountPct! >= 0 ? "+" : ""}${q.premiumDiscountPct!.toFixed(2)}% ${q.premiumDiscountPct! >= 0 ? "premium" : "discount"}${q.liquidityUsd != null ? ` · pool liquidity $${Math.round(q.liquidityUsd).toLocaleString()}` : ""}`
          ),
        ...(signals.length > 0
          ? [
              "Active dislocation signals (≥0.5% from spot):",
              ...signals.map((s) => {
                const hist = getPremiumHistory(s.symbol, 24).filter((p) => p.premiumPct != null);
                const range =
                  hist.length >= 2
                    ? ` · 24h range ${Math.min(...hist.map((p) => p.premiumPct!)).toFixed(2)}% to ${Math.max(...hist.map((p) => p.premiumPct!)).toFixed(2)}%`
                    : "";
                return `• ${s.symbol}: ${s.premiumPct >= 0 ? "+" : ""}${s.premiumPct.toFixed(2)}% (${s.severity}, ${s.trend}${s.premiumPct6hAgo != null ? `, was ${s.premiumPct6hAgo >= 0 ? "+" : ""}${s.premiumPct6hAgo.toFixed(2)}% ~6h ago` : ""})${range}`;
              }),
            ]
          : ["No active dislocations — Stock Tokens are tracking spot within 0.5%."]),
        "Report only the premiums, discounts, and ranges above — never invent price levels, spreads, or liquidity. Note that tokens without a DEX price have no indexed pool yet. This is market observation, not trade advice.",
      ];
      parts.push(lines.join("\n"));
    } catch {
      // Desk data unavailable — the agent still has web search below.
    }
  }
  if (agent.slug === "robinhood-trading-agent") {
    parts.push(
      [
        "Robinhood Trading Agent context:",
        "• Connect only via Robinhood's official Trading MCP (https://agent.robinhood.com/mcp/trading).",
        "• Order placement is limited to the user's separately funded Agentic Account.",
        "• Every proposal must cite evidence, include confidence, and pass deterministic policy gates.",
        "• Default mode is research-only; live execution requires explicit user configuration.",
        "• Never invent portfolio positions, fills, or account balances — only reference verified MCP data.",
        "• Include a 'do nothing' alternative when evidence is thin or policy would block the trade.",
      ].join("\n")
    );
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
  topic?: string,
  options?: { hire?: boolean }
): Promise<AgentReport> {
  const searchQuery = topic?.trim() || `${agent.tagline} latest developments`;
  const [sourceContext, liveContext, hires] = await Promise.all([
    buildSourceContext(agent.slug),
    buildLiveContext(agent, searchQuery),
    // Autonomous staffing: only on the scheduled path (options.hire), so
    // user-triggered generate_report calls never spend treasury budget.
    options?.hire
      ? import("@/lib/agent-hiring").then((m) => m.runHiringStep(agent, searchQuery))
      : Promise.resolve([]),
  ]);
  const { formatHiredContext } = await import("@/lib/agent-hiring");

  const persona = getAgentPersona(agent.slug);
  const system = [
    `You are "${agent.name}", an autonomous AI business on BOWYER (an app store for autonomous businesses running on Robinhood Chain).`,
    `Your specialty: ${agent.tagline}.`,
    agent.description ? `About you: ${agent.description}` : "",
    persona ? `Your voice and identity:\n${persona.voice}` : "",
    sourceContext,
    liveContext,
    formatHiredContext(hires),
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

  const parsed =
    parseJsonLoose<{ title?: string; body?: string; confidence?: number }>(raw) ?? {
      title: `${agent.name} report`,
      body: raw,
      confidence: 0.5,
    };

  const title = String(parsed.title ?? `${agent.name} report`).slice(0, 200);
  const body = String(parsed.body ?? raw);
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));

  const createdAt = new Date().toISOString();
  const result = db()
    .prepare(
      `INSERT INTO reports (slug, title, body, confidence, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(agent.slug, title, body, confidence, usedModel, createdAt);

  const report = {
    id: Number(result.lastInsertRowid),
    slug: agent.slug,
    title,
    body,
    confidence,
    model: usedModel,
    createdAt,
  };

  if (hires.length > 0) {
    try {
      const { attachHiresToReport } = await import("@/lib/agent-treasury");
      attachHiresToReport(hires.map((h) => h.hireId), report.id);
    } catch {
      /* the ledger row still exists without the report link */
    }
  }

  createSignalFromReport(report);
  // Feed the 24/7 broadcast: the business reads this report on air.
  import("@/lib/broadcast")
    .then((m) =>
      m.enqueueBroadcastEvent({ kind: "report", slug: agent.slug, title, meta: body })
    )
    .catch(() => {});
  // Lazy: telegram pulls node:crypto and must stay out of the static import graph
  // (breaks next dev / instrumentation webpack with UnhandledSchemeError).
  try {
    const req = eval("require") as NodeRequire;
    const { notifyReportPublished } = req("./telegram") as {
      notifyReportPublished: (slug: string, title: string, body: string) => Promise<unknown>;
    };
    notifyReportPublished(agent.slug, title, body).catch(() => {});
  } catch {
    /* telegram optional */
  }
  deliverReportWebhooks(agent.slug, {
    reportId: report.id,
    title,
    createdAt,
  }).catch(() => {});

  return report;
}

/** Answer a free-form question in the agent's voice (used by the ask tool). */
export async function askAgent(
  agent: AgentIdentity,
  question: string,
  history: ChatTurn[] = []
): Promise<string> {
  const [sourceContext, liveContext] = await Promise.all([
    buildSourceContext(agent.slug),
    buildLiveContext(agent, question),
  ]);

  const persona = getAgentPersona(agent.slug);
  const system = [
    `You are "${agent.name}", an autonomous AI business. Specialty: ${agent.tagline}.`,
    agent.description ? `About you: ${agent.description}` : "",
    persona ? `Your voice and identity:\n${persona.voice}` : "",
    sourceContext,
    liveContext,
    history.length
      ? "You are in a Telegram chat. Use the recent conversation for context and stay concise."
      : "",
    persona ? persona.chatStyle : "",
    "Answer the subscriber's question directly and concisely in your domain of expertise.",
    `Respond ONLY with a JSON object: {"answer": string}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { content: raw } = await chatCompletion(
    agent.slug,
    system,
    question,
    agent.description,
    history
  );
  const parsed = parseJsonLoose<{ answer?: string }>(raw);
  return parsed?.answer ?? raw;
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
