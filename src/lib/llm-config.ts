/**
 * LLM configuration for businesses. Platform mode uses the server's LLM_API_KEY;
 * custom mode uses the founder's own key (stored server-side, never returned).
 */

export type LlmMode = "platform" | "custom";

export interface AgentLlmConfig {
  mode: LlmMode;
  /** OpenAI-compatible model id, e.g. llama-3.3-70b-versatile */
  model: string;
  /** Only when mode === "custom" */
  apiKey?: string;
  /** Only when mode === "custom" — defaults to OpenAI */
  baseUrl?: string;
}

/** Models founders can pick when using BOWYER's hosted LLM (server key). */
export const PLATFORM_MODELS = [
  {
    id: "fast",
    name: "Fast",
    model: "llama-3.1-8b-instant",
    blurb: "Quick responses. Best for alerts and short answers.",
    badge: "Free tier",
  },
  {
    id: "balanced",
    name: "Balanced",
    model: "llama-3.3-70b-versatile",
    blurb: "Strong reasoning. Recommended for most businesses.",
    badge: "Recommended",
  },
  {
    id: "deep",
    name: "Deep",
    model: "llama-3.3-70b-versatile",
    blurb: "Maximum quality on every report and answer.",
    badge: "Best quality",
  },
] as const;

export type PlatformModelId = (typeof PLATFORM_MODELS)[number]["id"];

export const BYOK_PROVIDERS = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    keyHint: "gsk_…",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o"],
    keyHint: "sk-…",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["meta-llama/llama-3.3-70b-instruct:free", "google/gemma-2-9b-it:free"],
    keyHint: "sk-or-…",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    baseUrl: "",
    models: [],
    keyHint: "Any OpenAI-compatible key",
  },
] as const;

export type ByokProviderId = (typeof BYOK_PROVIDERS)[number]["id"];

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function platformModelIdToModel(id: string): string {
  return PLATFORM_MODELS.find((m) => m.id === id)?.model ?? PLATFORM_MODELS[1].model;
}

export function platformModelLabel(id: string): string {
  return PLATFORM_MODELS.find((m) => m.id === id)?.name ?? id;
}

export function resolveRuntimeLlm(config: AgentLlmConfig | null): {
  model: string;
  apiKey: string | undefined;
  baseUrl: string;
} {
  if (config?.mode === "custom" && config.apiKey) {
    return {
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl?.trim() || DEFAULT_BASE_URL,
    };
  }

  const platformModel =
    config?.mode === "platform"
      ? platformModelIdToModel(config.model)
      : process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";

  return {
    model: platformModel,
    apiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY,
    baseUrl: process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL,
  };
}

export function isLocalBaseUrl(baseUrl: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/.test(baseUrl);
}

export function llmConfigured(config: AgentLlmConfig | null): boolean {
  const resolved = resolveRuntimeLlm(config);
  return Boolean(resolved.apiKey) || isLocalBaseUrl(resolved.baseUrl);
}

export function sanitizeLlmConfigInput(body: Record<string, unknown>): AgentLlmConfig | null {
  const llm = body.llm as Record<string, unknown> | undefined;
  if (!llm) return null;

  const mode = llm.mode === "custom" ? "custom" : "platform";

  if (mode === "platform") {
    const id = String(llm.model ?? "balanced");
    const valid = PLATFORM_MODELS.some((m) => m.id === id);
    return { mode: "platform", model: valid ? id : "balanced" };
  }

  const apiKey = String(llm.apiKey ?? "").trim();
  const model = String(llm.model ?? "").trim();
  const baseUrl = String(llm.baseUrl ?? "").trim();

  if (!apiKey || apiKey.length < 8) return null;
  if (!model || model.length < 2) return null;

  return {
    mode: "custom",
    model: model.slice(0, 120),
    apiKey: apiKey.slice(0, 512),
    baseUrl: baseUrl ? baseUrl.slice(0, 256) : undefined,
  };
}

/** Public-safe summary — never includes apiKey. */
export function llmConfigSummary(config: AgentLlmConfig | null): string {
  if (!config) return "Platform default";
  if (config.mode === "custom") {
    const host = config.baseUrl ? new URL(config.baseUrl).hostname : "openai.com";
    return `Your key · ${config.model} · ${host}`;
  }
  return `BOWYER · ${platformModelLabel(config.model)}`;
}
