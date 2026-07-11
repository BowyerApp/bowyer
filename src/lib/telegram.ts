/**
 * Telegram delivery — subscribers get reports DMed when businesses publish.
 *
 * TELEGRAM_BOT_TOKEN — from @BotFather
 * TELEGRAM_WEBHOOK_SECRET — optional, validates webhook POSTs
 *
 * User flow:
 *   /link 0xYourWallet
 *   /follow whale-hunter   (free: anyone linked; paid: must have subscription)
 */

import { db } from "@/lib/db";
import { getAgentSummary } from "@/lib/data/agents";
import { hasSubscription } from "@/lib/data/agent-registry";

const API = (token: string) => `https://api.telegram.org/bot${token}`;

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export function linkWallet(chatId: string, wallet: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return false;
  db()
    .prepare(
      `INSERT INTO telegram_links (chat_id, wallet, linked_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET wallet = ?, linked_at = ?`
    )
    .run(
      chatId,
      wallet.toLowerCase(),
      new Date().toISOString(),
      wallet.toLowerCase(),
      new Date().toISOString()
    );
  return true;
}

export function followBusiness(chatId: string, slug: string): { ok: boolean; message: string } {
  const agent = getAgentSummary(slug);
  if (!agent) return { ok: false, message: `Unknown business: ${slug}` };

  const link = db()
    .prepare("SELECT wallet FROM telegram_links WHERE chat_id = ?")
    .get(chatId) as { wallet: string } | undefined;
  if (!link) return { ok: false, message: "Link your wallet first: /link 0xYourWallet" };

  const isPaid = agent.pricing.model !== "free" && agent.pricing.amount > 0;
  if (isPaid && !hasSubscription(slug, link.wallet)) {
    return {
      ok: false,
      message: `Subscribe to ${agent.name} on bowyer.app first, then /follow ${slug}`,
    };
  }

  db()
    .prepare(
      `INSERT OR IGNORE INTO telegram_follows (chat_id, slug, followed_at)
       VALUES (?, ?, ?)`
    )
    .run(chatId, slug, new Date().toISOString());

  return { ok: true, message: `You will receive ${agent.name} reports here.` };
}

async function sendMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  const res = await fetch(`${API(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4000),
      disable_web_page_preview: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Telegram send failed: ${detail.slice(0, 200)}`);
  }
}

/** Notify everyone following this business on Telegram. */
export async function notifyReportPublished(
  slug: string,
  title: string,
  body: string
): Promise<number> {
  if (!telegramConfigured()) return 0;

  const rows = db()
    .prepare("SELECT chat_id FROM telegram_follows WHERE slug = ?")
    .all(slug) as { chat_id: string }[];

  const agent = getAgentSummary(slug);
  const name = agent?.name ?? slug;
  const preview = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  const text = `${name}\n\n${title}\n\n${preview}\n\nbowyer.app/agents/${slug}`;

  let sent = 0;
  for (const { chat_id } of rows) {
    try {
      await sendMessage(chat_id, text);
      sent++;
    } catch {
      // skip failed chats
    }
  }
  return sent;
}

export async function handleTelegramUpdate(update: {
  message?: { chat: { id: number }; text?: string };
}): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  if (text.startsWith("/start")) {
    await sendMessage(
      chatId,
      "BOWYER delivery bot\n\n/link 0xYourWallet\n/follow whale-hunter\n\nGet autonomous business reports in Telegram."
    );
    return;
  }

  if (text.startsWith("/link")) {
    const wallet = text.split(/\s+/)[1]?.trim() ?? "";
    if (linkWallet(chatId, wallet)) {
      await sendMessage(chatId, `Wallet linked: ${wallet.slice(0, 6)}…${wallet.slice(-4)}`);
    } else {
      await sendMessage(chatId, "Usage: /link 0xYourWalletAddress");
    }
    return;
  }

  if (text.startsWith("/follow")) {
    const slug = text.split(/\s+/)[1]?.trim().toLowerCase() ?? "";
    const result = followBusiness(chatId, slug);
    await sendMessage(chatId, result.message);
    return;
  }

  if (text.startsWith("/help")) {
    await sendMessage(
      chatId,
      "Commands:\n/link 0xWallet — connect your bowyer.app wallet\n/follow slug — receive reports for a business\n\nbowyer.app"
    );
  }
}
