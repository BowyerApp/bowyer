/**
 * LLM configuration for businesses. Platform mode uses the server's LLM_API_KEY;
 * custom mode uses the founder's own key (stored server-side, never returned).
 */

export type LlmMode = "platform" | "custom";

export interface AgentLlmConfig {
  mode: LlmMode;
  /** Platform model id or OpenAI-compatible model id when mode === "custom" */
  model: string;
  /** Only when mode === "custom" */
  apiKey?: string;
  /** Only when mode === "custom" — defaults to OpenAI */
  baseUrl?: string;
}

export interface PlatformModelEntry {
  id: string;
  name: string;
  provider: string;
  /** OpenAI-compatible model id sent to the runtime */
  model: string;
  blurb: string;
  badge?: string;
  comingSoon?: boolean;
  premium?: boolean;
}

/** Models founders can pick when using BOWYER's hosted LLM (server key). */
export const PLATFORM_MODELS: PlatformModelEntry[] = [
  {
    id: "fast",
    name: "Llama 3.1 8B Instant",
    provider: "Meta · Groq",
    model: "llama-3.1-8b-instant",
    blurb: "Ultra-fast alerts, Telegram replies, and short answers.",
    badge: "Free tier",
  },
  {
    id: "balanced",
    name: "Llama 3.3 70B Versatile",
    provider: "Meta · Groq",
    model: "llama-3.3-70b-versatile",
    blurb: "Strong default for reports, research, and subscriber Q&A.",
    badge: "Recommended",
  },
  {
    id: "deep",
    name: "Llama 3.3 70B Deep",
    provider: "Meta · Groq",
    model: "llama-3.3-70b-versatile",
    blurb: "Same backbone with maximum reasoning depth on every task.",
    badge: "Best quality",
  },
  {
    id: "mixtral",
    name: "Mixtral 8×7B",
    provider: "Mistral · Groq",
    model: "mixtral-8x7b-32768",
    blurb: "Mixture-of-experts model — great for multi-step workflows.",
    badge: "Standard",
  },
  {
    id: "gemma",
    name: "Gemma 2 9B",
    provider: "Google · Groq",
    model: "gemma2-9b-it",
    blurb: "Compact and efficient for high-volume agent loops.",
    badge: "Standard",
  },
  {
    id: "qwen",
    name: "Qwen 2.5 32B",
    provider: "Alibaba · Groq",
    model: "qwen2.5-32b-instruct",
    blurb: "Strong instruction-following for structured agent output.",
    badge: "Standard",
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "OpenAI",
    model: "gpt-5.4",
    blurb: "Flagship OpenAI reasoning for long-form research and trading memos.",
    badge: "Premium",
    premium: true,
  },
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "xAI",
    model: "grok-3",
    blurb: "Real-time X + web context — built for market-moving signal.",
    badge: "Premium",
    premium: true,
  },
  {
    id: "claude-opus",
    name: "Claude Opus 4",
    provider: "Anthropic",
    model: "claude-opus-4-20250514",
    blurb: "Maximum Anthropic reasoning for complex multi-source analysis.",
    badge: "Premium",
    premium: true,
  },
  {
    id: "fable",
    name: "Fable",
    provider: "Fable",
    model: "fable-large",
    blurb: "Narrative-first model tuned for agent personas and subscriber chat.",
    badge: "Premium",
    premium: true,
  },
  {
    id: "gemini-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    model: "gemini-2.5-pro",
    blurb: "Long-context Google model for document-heavy research agents.",
    badge: "Premium",
    premium: true,
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    model: "deepseek-r1",
    blurb: "Open reasoning model for chain-of-thought trading analysis.",
    badge: "Premium",
    premium: true,
  },
  {
    id: "o3",
    name: "OpenAI o3",
    provider: "OpenAI",
    model: "o3",
    blurb: "Deep deliberation for high-stakes autonomous decisions.",
    badge: "Premium",
    premium: true,
  },
  {
    id: "sonnet",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    model: "claude-sonnet-4-20250514",
    blurb: "Fast Anthropic tier — daily reports without premium latency.",
    badge: "Premium",
    premium: true,
  },
  {
    id: "mistral-large",
    name: "Mistral Large",
    provider: "Mistral",
    model: "mistral-large-latest",
    blurb: "European flagship — strong multilingual research output.",
    badge: "Premium",
    premium: true,
  },
];

export const PLATFORM_MODELS_STANDARD = PLATFORM_MODELS.filter((m) => !m.premium && !m.comingSoon);
export const PLATFORM_MODELS_PREMIUM = PLATFORM_MODELS.filter((m) => m.premium && !m.comingSoon);
export const PLATFORM_MODELS_AVAILABLE = PLATFORM_MODELS.filter((m) => !m.comingSoon);
export const PLATFORM_MODELS_COMING_SOON = PLATFORM_MODELS.filter((m) => m.comingSoon);

export type PlatformModelId = (typeof PLATFORM_MODELS)[number]["id"];

export const BYOK_PROVIDERS = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
      "qwen2.5-32b-instruct",
    ],
    keyHint: "gsk_…",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o3-mini"],
    keyHint: "sk-…",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-haiku-20241022"],
    keyHint: "sk-ant-…",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemma-2-9b-it:free",
      "deepseek/deepseek-r1",
      "x-ai/grok-3",
      "anthropic/claude-opus-4",
    ],
    keyHint: "sk-or-…",
  },
  {
    id: "xai",
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    models: ["grok-3", "grok-3-mini", "grok-2-1212"],
    keyHint: "xai-…",
  },
  {
    id: "google",
    label: "Google AI",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    keyHint: "AIza…",
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

/** OpenRouter (or premium provider) model ids for platform premium tier. */
const PREMIUM_RUNTIME_MODEL: Record<string, string> = {
  "gpt-5.4": "openai/gpt-4o",
  "grok-3": "x-ai/grok-3",
  "claude-opus": "anthropic/claude-opus-4",
  fable: "openai/gpt-4o-mini",
  "gemini-pro": "google/gemini-2.5-pro-preview",
  "deepseek-r1": "deepseek/deepseek-r1",
  o3: "openai/o3-mini",
  sonnet: "anthropic/claude-sonnet-4",
  "mistral-large": "mistralai/mistral-large",
};

export function isPremiumPlatformModelId(id: string): boolean {
  return PLATFORM_MODELS.some((m) => m.id === id && m.premium);
}

export function platformModelIdToModel(id: string): string {
  const entry = PLATFORM_MODELS.find((m) => m.id === id && !m.comingSoon);
  if (entry) return entry.model;
  return PLATFORM_MODELS_STANDARD.find((m) => m.id === "balanced")?.model ?? "llama-3.3-70b-versatile";
}

function premiumRuntimeCredentials(): { apiKey: string; baseUrl: string } | null {
  const apiKey =
    process.env.LLM_PREMIUM_API_KEY?.trim() ??
    process.env.OPENROUTER_API_KEY?.trim() ??
    process.env.LLM_FALLBACK_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl:
      process.env.LLM_PREMIUM_BASE_URL?.trim() ||
      process.env.LLM_FALLBACK_BASE_URL?.trim() ||
      "https://openrouter.ai/api/v1",
  };
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

  const platformId =
    config?.mode === "platform" ? config.model : (process.env.LLM_MODEL ?? "llama-3.3-70b-versatile");

  if (config?.mode === "platform" && isPremiumPlatformModelId(platformId)) {
    const premium = premiumRuntimeCredentials();
    const runtimeModel = PREMIUM_RUNTIME_MODEL[platformId] ?? platformModelIdToModel(platformId);
    if (premium) {
      return { model: runtimeModel, apiKey: premium.apiKey, baseUrl: premium.baseUrl };
    }
  }

  const platformModel =
    config?.mode === "platform"
      ? platformModelIdToModel(platformId)
      : (process.env.LLM_MODEL ?? "llama-3.3-70b-versatile");

  return {
    model: platformModel,
    apiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY,
    baseUrl: process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL,
  };
}

/** Optional second provider when the primary hits rate limits (429) or is down. */
export function fallbackRuntimeLlm(): {
  model: string;
  apiKey: string;
  baseUrl: string;
} | null {
  const apiKey = process.env.LLM_FALLBACK_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    model: process.env.LLM_FALLBACK_MODEL?.trim() || "llama-3.3-70b-versatile",
    apiKey,
    baseUrl: process.env.LLM_FALLBACK_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
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
    const valid = PLATFORM_MODELS_AVAILABLE.some((m) => m.id === id);
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
