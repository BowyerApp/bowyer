import { db } from "@/lib/db";
import { getAgentSummary } from "@/lib/data/agents";
import { hasSubscription, recordSubscription } from "@/lib/data/agent-registry";
import { getPromoStatus } from "@/lib/promo-pricing";
import type { ChatTurn } from "@/lib/agent-runtime";
// node:crypto is eval-required (db.ts pattern) so this module stays importable
// from the instrumentation/scheduler webpack graph.
function createHash(algorithm: string) {
  const req = eval("require") as NodeRequire;
  const crypto = req("node:crypto") as typeof import("node:crypto");
  return crypto.createHash(algorithm);
}

export const DEFAULT_CHAT_AGENT = "robinhood-trading-agent";
export const SAMPLE_AGENT = "whale-hunter";
const SITE = "https://bowyer.app";
const HISTORY_LIMIT = 10;
const HISTORY_KEEP = 40;

export type ChatAccess =
  | { ok: true }
  | { ok: false; reason: "wallet" | "subscribe" | "unknown" };

export function catalogRequiresSubscription(slug: string): boolean {
  const agent = getAgentSummary(slug);
  if (!agent) return false;
  return agent.pricing.model !== "free" && agent.pricing.amount > 0;
}

export function demoModeEnabled(): boolean {
  return process.env.TELEGRAM_DEMO_MODE === "1";
}

export function isWhitelistedDemoChat(chatId: string): boolean {
  const ids =
    process.env.TELEGRAM_DEMO_CHAT_IDS?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? [];
  return ids.includes(chatId);
}

/** Deterministic demo wallet for a Telegram chat (valid 0x address, not a real key). */
export function demoWalletForChat(chatId: string): string {
  return `0x${createHash("sha256").update(`bowyer-demo:${chatId}`).digest("hex").slice(0, 40)}`;
}

/** Grant Robinhood chat access in Telegram without a website subscription. */
export function grantTelegramDemoAccess(
  chatId: string,
  slug = DEFAULT_CHAT_AGENT
): { wallet: string; slug: string } {
  const wallet = demoWalletForChat(chatId);
  const now = new Date().toISOString();

  db()
    .prepare(
      `INSERT INTO telegram_links (chat_id, wallet, linked_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET wallet = excluded.wallet, linked_at = excluded.linked_at`
    )
    .run(chatId, wallet, now);

  db()
    .prepare(
      `INSERT OR IGNORE INTO telegram_follows (chat_id, slug, followed_at)
       VALUES (?, ?, ?)`
    )
    .run(chatId, slug, now);

  if (!hasSubscription(slug, wallet)) {
    recordSubscription({ slug, subscriber: wallet, amountUsd: 0, at: now });
  }

  setActiveSession(chatId, slug);
  return { wallet, slug };
}

/** Whether this chat may send messages to the agent (free agents always; paid need wallet + sub). */
export function canChatWithAgent(slug: string, wallet?: string, chatId?: string): ChatAccess {
  if (chatId && isWhitelistedDemoChat(chatId)) return { ok: true };

  const agent = getAgentSummary(slug);
  if (!agent) return { ok: false, reason: "unknown" };
  if (slug === SAMPLE_AGENT) return { ok: true };
  if (!catalogRequiresSubscription(slug)) return { ok: true };
  if (!wallet) return { ok: false, reason: "wallet" };
  if (!hasSubscription(slug, wallet)) return { ok: false, reason: "subscribe" };
  return { ok: true };
}

export function setActiveSession(chatId: string, slug: string): void {
  db()
    .prepare(
      `INSERT INTO telegram_sessions (chat_id, slug, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET slug = excluded.slug, updated_at = excluded.updated_at`
    )
    .run(chatId, slug, new Date().toISOString());
}

export function resolveActiveAgentSlug(chatId: string): string {
  const session = db()
    .prepare("SELECT slug FROM telegram_sessions WHERE chat_id = ?")
    .get(chatId) as { slug: string } | undefined;
  if (session?.slug) return session.slug;

  const lastFollow = db()
    .prepare("SELECT slug FROM telegram_follows WHERE chat_id = ? ORDER BY followed_at DESC LIMIT 1")
    .get(chatId) as { slug: string } | undefined;
  return lastFollow?.slug ?? DEFAULT_CHAT_AGENT;
}

export function getTelegramHistory(chatId: string, slug: string, limit = HISTORY_LIMIT): ChatTurn[] {
  const rows = db()
    .prepare(
      `SELECT role, content FROM telegram_messages
       WHERE chat_id = ? AND slug = ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(chatId, slug, limit) as { role: string; content: string }[];
  return rows
    .reverse()
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
}

export function appendTelegramMessage(
  chatId: string,
  slug: string,
  role: "user" | "assistant",
  content: string
): void {
  db()
    .prepare(
      `INSERT INTO telegram_messages (chat_id, slug, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(chatId, slug, role, content, new Date().toISOString());

  db()
    .prepare(
      `DELETE FROM telegram_messages
       WHERE chat_id = ? AND slug = ? AND id NOT IN (
         SELECT id FROM telegram_messages
         WHERE chat_id = ? AND slug = ?
         ORDER BY id DESC LIMIT ?
       )`
    )
    .run(chatId, slug, chatId, slug, HISTORY_KEEP);
}

export function subscribePrompt(slug: string): { text: string; url: string; label: string } {
  const agent = getAgentSummary(slug);
  const name = agent?.name ?? slug;
  const promo = getPromoStatus(slug);
  if (promo?.active) {
    return {
      text: `${name} chat is free for the next ${promo.spotsRemaining} subscribers — claim your POC spot, then come back and ask anything.`,
      url: `${SITE}/agents/${slug}#subscribe`,
      label: `Claim free POC · ${promo.spotsRemaining} left`,
    };
  }
  return {
    text: `Chat with ${name} requires an active subscription.`,
    url: `${SITE}/agents/${slug}#subscribe`,
    label: `Subscribe to ${name}`,
  };
}

export function walletPrompt(): { text: string; url: string } {
  return {
    text: "Link your Robinhood Chain wallet on BOWYER so I know it's you — then claim your free POC spot to unlock chat.",
    url: `${SITE}/portfolio`,
  };
}
