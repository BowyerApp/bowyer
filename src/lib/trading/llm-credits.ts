import "server-only";

/**
 * OpenRouter credit watchdog. The premium LLM rail dying silently has now
 * stalled the desk twice — decisions degrade to the rate-limited free tier
 * and the owner only finds out when they ask "why no trades". Poll the
 * credits endpoint from the engine loop and alert the owner BEFORE (and
 * when) the account runs dry.
 */

const CHECK_EVERY_MS = 30 * 60_000;
const REALERT_EVERY_MS = 6 * 3_600_000;
const WARN_AT_USD = 3;

let lastCheck = 0;
let lastAlertAt = 0;
let lastAlertKind: "warn" | "dead" | null = null;

function openRouterKey(): string | null {
  const key = process.env.LLM_PREMIUM_API_KEY?.trim() || process.env.LLM_FALLBACK_API_KEY?.trim();
  const base = process.env.LLM_PREMIUM_BASE_URL ?? "";
  // Only meaningful when the premium rail actually rides OpenRouter.
  if (key && (base.includes("openrouter") || !base)) return key;
  return null;
}

export async function openRouterCreditsUsd(): Promise<number | null> {
  const key = openRouterKey();
  if (!key) return null;
  const res = await fetch("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`credits endpoint ${res.status}`);
  const json = (await res.json()) as { data?: { total_credits?: number; total_usage?: number } };
  const total = json.data?.total_credits;
  const used = json.data?.total_usage;
  if (typeof total !== "number" || typeof used !== "number") return null;
  return total - used;
}

/** Called from the engine tick; rate-limits itself. `owner` gets the Telegram alert. */
export async function watchLlmCredits(owner: string): Promise<void> {
  if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  try {
    const remaining = await openRouterCreditsUsd();
    if (remaining === null) return;
    console.log(`[llm-credits] OpenRouter balance: $${remaining.toFixed(2)}`);

    const kind: "warn" | "dead" | null =
      remaining <= 0.25 ? "dead" : remaining < WARN_AT_USD ? "warn" : null;
    if (!kind) {
      lastAlertKind = null;
      return;
    }
    // Escalations always send; same-level reminders wait out the cooldown.
    const escalated = kind === "dead" && lastAlertKind !== "dead";
    if (!escalated && Date.now() - lastAlertAt < REALERT_EVERY_MS) return;

    const text =
      kind === "dead"
        ? `🚨 OpenRouter is OUT OF CREDITS ($${remaining.toFixed(2)} left). The trading desk is running on the rate-limited free tier: decisions are rare and low-quality until you top up.\n\nhttps://openrouter.ai/settings/credits\n\nStops and exits remain active — they never depend on the LLM.`
        : `⚠️ OpenRouter credits low: $${remaining.toFixed(2)} remaining. At the current burn the desk goes dark soon — top up to keep premium decisions flowing.\n\nhttps://openrouter.ai/settings/credits`;
    const { notifyOwnerAlert } = await import("@/lib/telegram");
    if (await notifyOwnerAlert(owner, text)) {
      lastAlertAt = Date.now();
      lastAlertKind = kind;
    }
  } catch (err) {
    console.warn("[llm-credits] check failed:", err instanceof Error ? err.message : err);
  }
}
