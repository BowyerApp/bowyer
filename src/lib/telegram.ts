/**
 * Telegram delivery — subscribers get reports DMed when businesses publish.
 *
 * TELEGRAM_BOT_TOKEN — from @BotFather
 * TELEGRAM_WEBHOOK_SECRET — required, validates webhook POSTs
 *
 * User flow:
 *   Portfolio → Connections → Telegram Login
 *   /follow whale-hunter
 *   /use whale-hunter
 *   /ask What changed today?
 */

import { db } from "@/lib/db";
import { getAgentSummary } from "@/lib/data/agents";
import { hasSubscription } from "@/lib/data/agent-registry";
import { resolveAgentIdentity } from "@/lib/agent-identity";
import { askAgent, getStoredReports } from "@/lib/agent-runtime";

const API = (token: string) => `https://api.telegram.org/bot${token}`;

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
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
  const chunks = text.match(/[\s\S]{1,3900}(?:\s|$)|[\s\S]{1,3900}/g) ?? [text];
  for (const chunk of chunks) {
    const res = await fetch(`${API(token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk.trim(),
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Telegram send failed: ${detail.slice(0, 200)}`);
    }
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
  const wallet = db()
    .prepare("SELECT wallet FROM telegram_links WHERE chat_id = ?")
    .get(chatId) as { wallet: string } | undefined;

  if (text.startsWith("/start")) {
    await sendMessage(
      chatId,
      [
        "BOWYER agent chat",
        "",
        "1. Link Telegram in bowyer.app/portfolio → Connections.",
        "2. /follow agent-slug to receive reports.",
        "3. /use agent-slug, then ask a paid agent anything.",
        "",
        "Free agents deliver published reports only. Paid subscribers can chat with their agents.",
        "Type /help for commands.",
      ].join("\n")
    );
    return;
  }

  if (text.startsWith("/link")) {
    await sendMessage(
      chatId,
      "For your security, link Telegram from bowyer.app/portfolio → Connections. You will sign a wallet session there."
    );
    return;
  }

  if (text.startsWith("/follow")) {
    const slug = text.split(/\s+/)[1]?.trim().toLowerCase() ?? "";
    const result = followBusiness(chatId, slug);
    await sendMessage(chatId, result.message);
    return;
  }

  if (text.startsWith("/agents")) {
    if (!wallet) {
      await sendMessage(chatId, "Link Telegram in bowyer.app/portfolio → Connections first.");
      return;
    }
    const follows = db()
      .prepare("SELECT slug FROM telegram_follows WHERE chat_id = ? ORDER BY followed_at DESC")
      .all(chatId) as { slug: string }[];
    if (follows.length === 0) {
      await sendMessage(chatId, "No followed businesses yet. Try /follow whale-hunter.");
      return;
    }
    const lines = follows.map(({ slug }) => {
      const agent = getAgentSummary(slug);
      if (!agent) return `• ${slug}`;
      const paid = agent.pricing.model !== "free" && agent.pricing.amount > 0;
      const access = paid && hasSubscription(slug, wallet.wallet) ? "chat enabled" : paid ? "reports only" : "free reports";
      return `• ${slug} — ${access}`;
    });
    await sendMessage(chatId, `Your businesses\n\n${lines.join("\n")}\n\nUse /use slug to select one.`);
    return;
  }

  if (text.startsWith("/use")) {
    const slug = text.split(/\s+/)[1]?.trim().toLowerCase() ?? "";
    const follows = db()
      .prepare("SELECT 1 FROM telegram_follows WHERE chat_id = ? AND slug = ?")
      .get(chatId, slug);
    const agent = getAgentSummary(slug);
    if (!follows || !agent) {
      await sendMessage(chatId, "Follow that business first with /follow slug.");
      return;
    }
    db()
      .prepare(
        `INSERT INTO telegram_sessions (chat_id, slug, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET slug = excluded.slug, updated_at = excluded.updated_at`
      )
      .run(chatId, slug, new Date().toISOString());
    const paid = agent.pricing.model !== "free" && agent.pricing.amount > 0;
    const canChat = Boolean(wallet && (!paid || hasSubscription(slug, wallet.wallet)));
    await sendMessage(
      chatId,
      canChat && paid
        ? `${agent.name} selected. Send a message or use /ask your question.`
        : `${agent.name} selected. Use /latest ${slug} for published reports. Chat is available to paid subscribers.`
    );
    return;
  }

  if (text.startsWith("/latest")) {
    const requested = text.split(/\s+/)[1]?.trim().toLowerCase();
    const session = db()
      .prepare("SELECT slug FROM telegram_sessions WHERE chat_id = ?")
      .get(chatId) as { slug: string } | undefined;
    const slug = requested ?? session?.slug;
    if (!slug) {
      await sendMessage(chatId, "Choose an agent first with /use slug, or run /latest slug.");
      return;
    }
    const followed = db()
      .prepare("SELECT 1 FROM telegram_follows WHERE chat_id = ? AND slug = ?")
      .get(chatId, slug);
    if (!followed) {
      await sendMessage(chatId, "Follow that business first with /follow slug.");
      return;
    }
    const report = getStoredReports(slug, 1)[0];
    if (!report) {
      await sendMessage(chatId, `No published reports yet. View ${slug} at bowyer.app/agents/${slug}.`);
      return;
    }
    await sendMessage(chatId, `${report.title}\n\n${report.body}\n\nbowyer.app/agents/${slug}`);
    return;
  }

  if (text.startsWith("/help")) {
    await sendMessage(
      chatId,
      [
        "Commands:",
        "/follow slug — receive reports",
        "/agents — list your businesses",
        "/use slug — select an agent",
        "/ask question — chat with your selected paid agent",
        "/latest [slug] — read the newest report",
        "",
        "Link Telegram at bowyer.app/portfolio → Connections.",
      ].join("\n")
    );
    return;
  }

  const question = text.startsWith("/ask") ? text.replace(/^\/ask(?:@\w+)?\s*/i, "") : text;
  if (!question || question.startsWith("/")) {
    await sendMessage(chatId, "I don't recognize that command. Type /help.");
    return;
  }
  if (!wallet) {
    await sendMessage(chatId, "Link Telegram in bowyer.app/portfolio → Connections before chatting.");
    return;
  }

  const session = db()
    .prepare("SELECT slug FROM telegram_sessions WHERE chat_id = ?")
    .get(chatId) as { slug: string } | undefined;
  if (!session) {
    await sendMessage(chatId, "Select a paid business first with /use slug.");
    return;
  }
  const agent = getAgentSummary(session.slug);
  const runtimeAgent = resolveAgentIdentity(session.slug);
  if (!agent || !runtimeAgent) {
    await sendMessage(chatId, "That business is no longer available. Choose another with /agents.");
    return;
  }
  const paid = agent.pricing.model !== "free" && agent.pricing.amount > 0;
  if (!paid || !hasSubscription(session.slug, wallet.wallet)) {
    await sendMessage(
      chatId,
      `Chat with ${agent.name} is available to active paid subscribers. Subscribe at bowyer.app/agents/${session.slug}.`
    );
    return;
  }

  try {
    await sendMessage(chatId, `${agent.name} is thinking…`);
    const answer = await askAgent(runtimeAgent, question.slice(0, 2_000));
    await sendMessage(chatId, answer);
  } catch {
    await sendMessage(chatId, "I couldn't reach that agent right now. Please try again shortly.");
  }
}
