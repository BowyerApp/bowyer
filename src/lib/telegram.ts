/**
 * Telegram delivery — subscribers get reports DMed when businesses publish.
 *
 * TELEGRAM_BOT_TOKEN — from @BotFather
 * TELEGRAM_WEBHOOK_SECRET — required, validates webhook POSTs
 *
 * Conversation-first flow:
 *   /start → Robinhood Trading Agent is your default chat partner
 *   Type any message → agent replies (wallet + free POC sub for paid agents)
 *   /menu — power-user shortcuts
 */

import { db } from "@/lib/db";
import { getAgentSummary } from "@/lib/data/agents";
import { resolveAgentIdentity } from "@/lib/agent-identity";
import { askAgent, getStoredReports } from "@/lib/agent-runtime";
import {
  appendTelegramMessage,
  canChatWithAgent,
  catalogRequiresSubscription,
  DEFAULT_CHAT_AGENT,
  getTelegramHistory,
  grantTelegramDemoAccess,
  demoModeEnabled,
  resolveActiveAgentSlug,
  setActiveSession,
  subscribePrompt,
  walletPrompt,
} from "@/lib/telegram-chat";
import { getPromoStatus } from "@/lib/promo-pricing";
import { randomBytes } from "node:crypto";
import { scanTokenRisk } from "@/lib/meme-radar";

const API = (token: string) => `https://api.telegram.org/bot${token}`;
const SITE = "https://bowyer.app";
const SAMPLE_AGENT = "whale-hunter";
let menuConfigured = false;

const BOT_COMMANDS = [
  { command: "menu", description: "Open your BOWYER command center" },
  { command: "briefing", description: "Get today’s intelligence brief" },
  { command: "latest", description: "Read the latest agent signal" },
  { command: "scan", description: "Scan an EVM token contract" },
  { command: "agents", description: "See your followed agents" },
  { command: "follow", description: "Follow an agent: /follow slug" },
  { command: "use", description: "Select an agent: /use slug" },
  { command: "ask", description: "Ask your selected paid agent" },
  { command: "referral", description: "Get your invite link" },
];
const BOT_SHORT_DESCRIPTION = "Talk to your trading agent in Telegram.";
const BOT_DESCRIPTION = [
  "Chat directly with the Robinhood Trading Agent.",
  "",
  "Ask about risk limits, market context, and trade proposals — reports and alerts come to you here too.",
  "Free POC spots available for early traders.",
].join("\n");

type InlineKeyboard = {
  inline_keyboard: { text: string; url?: string; callback_data?: string; web_app?: { url: string } }[][];
};

const START_MENU: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: "Robinhood Trading Agent", callback_data: "cta:robinhood-trading" },
      { text: "Subscribe: Whale Hunter", callback_data: "cta:whale" },
    ],
    [
      { text: "Free memecoin alerts", callback_data: "cta:meme-radar" },
      { text: "Connect wallet + Telegram", callback_data: "cta:wallet" },
    ],
    [
      { text: "My businesses", callback_data: "cta:agents" },
      { text: "Daily intelligence brief", callback_data: "cta:briefings" },
    ],
    [
      { text: "Invite a trader", callback_data: "cta:referral" },
      { text: "Command center", web_app: { url: `${SITE}/telegram` } },
    ],
    [{ text: "Open BOWYER", url: SITE }],
  ],
};

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

/** Register Telegram's native Menu button commands once per running instance. */
export async function ensureTelegramMenu(): Promise<void> {
  if (menuConfigured) return;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  const requests = await Promise.all([
    fetch(`${API(token)}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: BOT_COMMANDS }),
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(`${API(token)}/setMyDescription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: BOT_DESCRIPTION }),
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(`${API(token)}/setMyShortDescription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ short_description: BOT_SHORT_DESCRIPTION }),
      signal: AbortSignal.timeout(10_000),
    }),
  ]);
  if (requests.every((res) => res.ok)) menuConfigured = true;
}

export function followBusiness(chatId: string, slug: string): { ok: boolean; message: string } {
  const agent = getAgentSummary(slug);
  if (!agent) return { ok: false, message: `Unknown business: ${slug}` };

  db()
    .prepare(
      `INSERT OR IGNORE INTO telegram_follows (chat_id, slug, followed_at)
       VALUES (?, ?, ?)`
    )
    .run(chatId, slug, new Date().toISOString());

  return {
    ok: true,
    message: `You will receive ${agent.name} reports here. Just send a message to chat with ${agent.name}.`,
  };
}

function installDefaultAgents(chatId: string): void {
  const now = new Date().toISOString();
  for (const slug of [SAMPLE_AGENT, DEFAULT_CHAT_AGENT]) {
    db()
      .prepare(
        `INSERT OR IGNORE INTO telegram_follows (chat_id, slug, followed_at)
         VALUES (?, ?, ?)`
      )
      .run(chatId, slug, now);
  }
  setActiveSession(chatId, DEFAULT_CHAT_AGENT);
  db()
    .prepare(
      `INSERT OR IGNORE INTO telegram_preferences (chat_id, briefings_enabled, briefing_hour, updated_at)
       VALUES (?, 1, 9, ?)`
    )
    .run(chatId, now);
  db()
    .prepare(
      `INSERT OR IGNORE INTO telegram_sample_progress (chat_id, installed_at, updated_at)
       VALUES (?, ?, ?)`
    )
    .run(chatId, now, now);
}

async function sendTyping(chatId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  await fetch(`${API(token)}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

async function selectAgentForChat(chatId: string, slug: string, wallet?: string): Promise<void> {
  const agent = getAgentSummary(slug);
  if (!agent) {
    await sendMessage(chatId, "That agent is no longer available.");
    return;
  }

  followBusiness(chatId, slug);
  setActiveSession(chatId, slug);

  const access = canChatWithAgent(slug, wallet, chatId);
  if (access.ok) {
    await sendMessage(
      chatId,
      `${agent.name} is ready. Ask me anything — I remember our recent conversation.`,
      {
        inline_keyboard: [
          [{ text: "Open agent page", url: `${SITE}/agents/${slug}` }],
          ...(slug === DEFAULT_CHAT_AGENT
            ? [[{ text: "Trading console", url: `${SITE}/agents/${slug}#trading` }]]
            : []),
        ],
      }
    );
    return;
  }

  if (access.reason === "wallet") {
    const prompt = walletPrompt();
    await sendMessage(chatId, prompt.text, {
      inline_keyboard: [[{ text: "Link wallet", url: prompt.url }]],
    });
    return;
  }

  const prompt = subscribePrompt(slug);
  await sendMessage(chatId, prompt.text, {
    inline_keyboard: [[{ text: prompt.label, url: prompt.url }]],
  });
}

async function handleAgentChat(
  chatId: string,
  question: string,
  wallet?: string
): Promise<void> {
  const slug = resolveActiveAgentSlug(chatId);
  setActiveSession(chatId, slug);

  const agent = getAgentSummary(slug);
  const runtimeAgent = resolveAgentIdentity(slug);
  if (!agent || !runtimeAgent) {
    await sendMessage(chatId, "That agent is no longer available. Try /menu.");
    return;
  }

  const access = canChatWithAgent(slug, wallet, chatId);
  if (!access.ok) {
    if (access.reason === "wallet") {
      const prompt = walletPrompt();
      await sendMessage(chatId, prompt.text, {
        inline_keyboard: [[{ text: "Link wallet + claim free POC", url: prompt.url }]],
      });
      return;
    }
    const prompt = subscribePrompt(slug);
    await sendMessage(chatId, prompt.text, {
      inline_keyboard: [[{ text: prompt.label, url: prompt.url }]],
    });
    return;
  }

  const trimmed = question.slice(0, 2_000);
  const history = getTelegramHistory(chatId, slug);
  appendTelegramMessage(chatId, slug, "user", trimmed);

  try {
    await sendTyping(chatId);
    const answer = await askAgent(runtimeAgent, trimmed, history);
    appendTelegramMessage(chatId, slug, "assistant", answer);
    await sendMessage(chatId, answer, {
      inline_keyboard:
        slug === DEFAULT_CHAT_AGENT
          ? [[{ text: "Trading console", url: `${SITE}/agents/${slug}#trading` }]]
          : [[{ text: "Open agent", url: `${SITE}/agents/${slug}` }]],
    });
  } catch {
    await sendMessage(chatId, "I couldn't reach that agent right now. Please try again shortly.");
  }
}

async function sendMessage(chatId: string, text: string, replyMarkup?: InlineKeyboard): Promise<void> {
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
        ...(replyMarkup && chunks.length === 1 ? { reply_markup: replyMarkup } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Telegram send failed: ${detail.slice(0, 200)}`);
    }
  }
}

function enqueueTelegramDelivery(input: {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  dedupeKey: string;
}): boolean {
  const result = db()
    .prepare(
      `INSERT INTO telegram_delivery_jobs (chat_id, text, reply_markup, dedupe_key, available_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO NOTHING`
    )
    .run(
      input.chatId,
      input.text,
      input.replyMarkup ? JSON.stringify(input.replyMarkup) : null,
      input.dedupeKey,
      Date.now()
    );
  return result.changes === 1;
}

/** Drain a bounded durable queue. Retries failures with exponential backoff. */
export async function processTelegramDeliveryQueue(limit = 25): Promise<{ delivered: number; retried: number }> {
  if (!telegramConfigured()) return { delivered: 0, retried: 0 };
  const now = Date.now();
  const jobs = db()
    .prepare(
      `SELECT id, chat_id, text, reply_markup, attempts
       FROM telegram_delivery_jobs
       WHERE delivered_at IS NULL AND failed_at IS NULL AND available_at <= ?
       ORDER BY id ASC LIMIT ?`
    )
    .all(now, Math.max(1, Math.min(limit, 50))) as {
    id: number; chat_id: string; text: string; reply_markup: string | null; attempts: number;
  }[];
  let delivered = 0;
  let retried = 0;
  for (const job of jobs) {
    // Lease before delivery so concurrent ticks cannot send the same job.
    const lease = db()
      .prepare(
        `UPDATE telegram_delivery_jobs SET available_at = ?
         WHERE id = ? AND delivered_at IS NULL AND failed_at IS NULL AND available_at <= ?`
      )
      .run(now + 15 * 60_000, job.id, now);
    if (lease.changes !== 1) continue;
    try {
      let replyMarkup: InlineKeyboard | undefined;
      try {
        replyMarkup = job.reply_markup ? (JSON.parse(job.reply_markup) as InlineKeyboard) : undefined;
      } catch {}
      await sendMessage(job.chat_id, job.text, replyMarkup);
      db().prepare("UPDATE telegram_delivery_jobs SET delivered_at = ? WHERE id = ?")
        .run(new Date().toISOString(), job.id);
      delivered++;
    } catch (error) {
      const attempts = job.attempts + 1;
      const message = error instanceof Error ? error.message.slice(0, 500) : "Telegram delivery failed";
      if (attempts >= 5) {
        db().prepare("UPDATE telegram_delivery_jobs SET attempts = ?, failed_at = ?, last_error = ? WHERE id = ?")
          .run(attempts, new Date().toISOString(), message, job.id);
      } else {
        const retryAt = Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** (attempts - 1));
        db().prepare("UPDATE telegram_delivery_jobs SET attempts = ?, available_at = ?, last_error = ? WHERE id = ?")
          .run(attempts, retryAt, message, job.id);
        retried++;
      }
    }
  }
  return { delivered, retried };
}

async function answerCallbackQuery(id: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  await fetch(`${API(token)}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

async function sendSampleSignal(chatId: string): Promise<void> {
  const report = getStoredReports(SAMPLE_AGENT, 1)[0];
  if (!report) {
    await sendMessage(
      chatId,
      "Whale Hunter is warming up. Your included sample agent is scanning Robinhood Chain wallet flows and will send its first published signal here."
    );
    return;
  }
  const preview = report.body.length > 700 ? `${report.body.slice(0, 700)}…` : report.body;
  await sendMessage(
    chatId,
    `SAMPLE SIGNAL · Whale Hunter\n\n${report.title}\n\n${preview}\n\nThis is a live BOWYER agent report — not trading advice.`,
    {
      inline_keyboard: [
        [
          { text: "Read full report", url: `${SITE}/agents/${SAMPLE_AGENT}` },
          { text: "How this works", callback_data: "cta:whale" },
        ],
      ],
    }
  );
}

async function sendStartMenu(chatId: string): Promise<void> {
  const promo = getPromoStatus(DEFAULT_CHAT_AGENT);
  const promoLine = promo?.active
    ? `\n\nWas $${promo.listPriceUsd}/mo — FREE for the next ${promo.spotsRemaining} traders. We want real proof this works.`
    : "";

  await sendMessage(
    chatId,
    [
      "You're connected to the Robinhood Trading Agent.",
      "",
      "Just type your question here — no commands needed. Ask about risk limits, market context, portfolio setup, or trade ideas.",
      promoLine,
      "",
      "Reports and alerts from your followed agents also land in this chat.",
      "Use /menu for shortcuts or /agents to switch agents.",
    ].join("\n"),
    START_MENU
  );
}

async function handleMenuAction(chatId: string, data: string, wallet?: string): Promise<void> {
  if (data.startsWith("agent:")) {
    await selectAgentForChat(chatId, data.slice("agent:".length), wallet);
    return;
  }
  if (data === "cta:robinhood-trading") {
    await selectAgentForChat(chatId, DEFAULT_CHAT_AGENT, wallet);
    return;
  }
  if (data === "cta:robinhood-trading-info") {
    await sendMessage(
      chatId,
      [
        "Robinhood Trading Agent",
        "",
        "Connect your Robinhood Agentic Account through the official Trading MCP.",
        "Set hard risk limits, review decision cards, and approve every live order — or opt into autonomous mode explicitly.",
        "",
        "Orders execute only in your separately funded Agentic Account.",
      ].join("\n"),
      {
        inline_keyboard: [
          [{ text: "Open trading console", url: `${SITE}/agents/robinhood-trading-agent#trading` }],
          [{ text: "Robinhood setup", url: "https://robinhood.com/us/en/agentic-trading/" }],
        ],
      }
    );
    return;
  }
  if (data === "cta:whale") {
    await sendMessage(
      chatId,
      "Whale Hunter is your included sample agent. Follow its free published reports here to experience BOWYER. Connect a wallet only when you want private agent chat, custom alerts, or a subscription.",
      {
        inline_keyboard: [
          [{ text: "Read the latest signal", callback_data: "sample:latest" }],
          [{ text: "View Whale Hunter", url: `${SITE}/agents/whale-hunter` }],
          [{ text: "Unlock private agent chat", callback_data: "cta:wallet" }],
        ],
      }
    );
    return;
  }
  if (data === "sample:latest") {
    await sendLatestReport(chatId, SAMPLE_AGENT);
    return;
  }
  if (data === "cta:trading") {
    await sendMessage(
      chatId,
      "Explore trading intelligence businesses: follow free reports or subscribe to chat with a paid agent.",
      {
        inline_keyboard: [
          [{ text: "Explore marketplace", url: `${SITE}/marketplace` }],
          [{ text: "Launch a trading agent", url: `${SITE}/launch` }],
        ],
      }
    );
    return;
  }
  if (data === "cta:meme-radar") {
    const result = followBusiness(chatId, "hood-meme-radar");
    await sendMessage(
      chatId,
      result.ok
        ? "Hood Meme Radar is now following Robinhood Chain memecoin activity for you. You will receive published alerts here. This is informational monitoring, not trading advice."
        : result.message,
      {
        inline_keyboard: [
          [{ text: "View Hood Meme Radar", url: `${SITE}/agents/hood-meme-radar` }],
          [{ text: "Read the latest report", callback_data: "meme:latest" }],
        ],
      }
    );
    return;
  }
  if (data === "meme:latest") {
    await sendLatestReport(chatId, "hood-meme-radar");
    return;
  }
  if (data === "cta:wallet") {
    await sendMessage(
      chatId,
      "Connect your Robinhood Chain wallet on BOWYER, then link Telegram under Portfolio → Connections. This verifies ownership before subscriptions and paid agent chat are enabled.",
      {
        inline_keyboard: [
          [{ text: "Connect wallet", url: `${SITE}/portfolio` }],
          [{ text: "Browse businesses", url: `${SITE}/marketplace` }],
        ],
      }
    );
    return;
  }
  if (data === "cta:agents") {
    const wallet = db()
      .prepare("SELECT wallet FROM telegram_links WHERE chat_id = ?")
      .get(chatId) as { wallet: string } | undefined;
    if (!wallet) {
      await sendMessage(
        chatId,
        "Link Telegram from Portfolio → Connections to see your businesses and use paid chat.",
        { inline_keyboard: [[{ text: "Link Telegram", url: `${SITE}/portfolio` }]] }
      );
      return;
    }
    const follows = db()
      .prepare("SELECT slug FROM telegram_follows WHERE chat_id = ? ORDER BY followed_at DESC")
      .all(chatId) as { slug: string }[];
    if (!follows.length) {
      await sendMessage(
        chatId,
        "You are not following any businesses yet.",
        { inline_keyboard: [[{ text: "Explore businesses", url: `${SITE}/marketplace` }]] }
      );
      return;
    }
    const lines = follows.map(({ slug }) => `• ${slug}`);
    await sendMessage(chatId, `Your followed businesses\n\n${lines.join("\n")}\n\nUse /use slug to select one.`);
    return;
  }
  if (data === "cta:briefings") {
    const pref = db()
      .prepare("SELECT briefings_enabled, briefing_hour FROM telegram_preferences WHERE chat_id = ?")
      .get(chatId) as { briefings_enabled: number; briefing_hour: number } | undefined;
    const enabled = pref?.briefings_enabled !== 0;
    const hour = pref?.briefing_hour ?? 9;
    await sendMessage(
      chatId,
      `Daily intelligence briefings are ${enabled ? "on" : "off"}.\n\nWhen enabled, BOWYER sends one concise digest of new reports from the businesses you follow at around ${String(hour).padStart(2, "0")}:00 UTC.`,
      {
        inline_keyboard: [
          [{ text: enabled ? "Pause briefings" : "Enable briefings", callback_data: `briefings:${enabled ? "off" : "on"}` }],
          [{ text: "Manage businesses", callback_data: "cta:agents" }],
        ],
      }
    );
    return;
  }
  if (data.startsWith("briefings:")) {
    const enabled = data === "briefings:on" ? 1 : 0;
    db()
      .prepare(
        `INSERT INTO telegram_preferences (chat_id, briefings_enabled, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET briefings_enabled = excluded.briefings_enabled, updated_at = excluded.updated_at`
      )
      .run(chatId, enabled, new Date().toISOString());
    await sendMessage(chatId, enabled ? "Daily intelligence briefings are on. Use /briefing for one right now." : "Daily intelligence briefings are paused.");
    return;
  }
  if (data === "cta:referral") {
    const code = createReferralCode(chatId);
    await sendMessage(
      chatId,
      `Your BOWYER invite link is ready.\n\nhttps://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "BOWYER_BOT"}?start=ref_${code}\n\nInvite traders to build a stronger intelligence network. Referral rewards unlock sitewide discounts on BOWYER agents.`
    );
  }
}

function createReferralCode(chatId: string): string {
  const existing = db()
    .prepare("SELECT code FROM telegram_referrals WHERE referrer_chat_id = ? AND referred_chat_id IS NULL ORDER BY created_at DESC LIMIT 1")
    .get(chatId) as { code: string } | undefined;
  if (existing) return existing.code;
  const code = randomBytes(6).toString("base64url");
  db().prepare("INSERT INTO telegram_referrals (code, referrer_chat_id) VALUES (?, ?)").run(code, chatId);
  return code;
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
  const card: InlineKeyboard = {
    inline_keyboard: [
      [
        { text: "Open report", url: `${SITE}/agents/${slug}` },
        { text: `Ask ${name}`, callback_data: `agent:${slug}` },
      ],
    ],
  };

  let queued = 0;
  for (const { chat_id } of rows) {
    if (enqueueTelegramDelivery({
      chatId: chat_id,
      text,
      replyMarkup: card,
      dedupeKey: `report:${slug}:${chat_id}:${title}:${body.slice(0, 120)}`,
    })) queued++;
  }
  await processTelegramDeliveryQueue();
  return queued;
}

async function sendBriefing(chatId: string): Promise<boolean> {
  const follows = db()
    .prepare("SELECT slug FROM telegram_follows WHERE chat_id = ? ORDER BY followed_at DESC LIMIT 8")
    .all(chatId) as { slug: string }[];
  if (!follows.length) {
    await sendMessage(chatId, "Your briefing is waiting for businesses to follow. Start with /follow whale-hunter.");
    return false;
  }

  const since = Date.now() - 36 * 60 * 60 * 1_000;
  const items = follows.flatMap(({ slug }) => {
    const report = getStoredReports(slug, 1)[0];
    if (!report || new Date(report.createdAt).getTime() < since) return [];
    return [`• ${getAgentSummary(slug)?.name ?? slug}: ${report.title}`];
  });
  if (!items.length) {
    await sendMessage(chatId, "No fresh intelligence from your followed businesses in the last 36 hours. Use /latest for the most recent reports.");
    return false;
  }
  await sendMessage(
    chatId,
    `BOWYER daily intelligence brief\n\n${items.join("\n")}\n\nOpen a business with /use slug, then ask a question.`,
    { inline_keyboard: [[{ text: "Open BOWYER", url: `${SITE}/portfolio` }]] }
  );
  return true;
}

/** Sends one daily digest per opted-in chat; invoked by the secured cron route. */
export async function sendDueDailyBriefings(now = new Date()): Promise<number> {
  if (!telegramConfigured()) return 0;
  const hour = now.getUTCHours();
  const day = now.toISOString().slice(0, 10);
  const rows = db()
    .prepare(
      `SELECT chat_id FROM telegram_preferences
       WHERE briefings_enabled = 1 AND briefing_hour = ?
       AND (last_briefing_date IS NULL OR last_briefing_date <> ?)`
    )
    .all(hour, day) as { chat_id: string }[];
  let delivered = 0;
  for (const { chat_id } of rows) {
    try {
      await sendBriefing(chat_id);
      db().prepare("UPDATE telegram_preferences SET last_briefing_date = ?, updated_at = ? WHERE chat_id = ?")
        .run(day, now.toISOString(), chat_id);
      delivered++;
    } catch {
      // A blocked or unreachable chat must not prevent other briefs.
    }
  }
  return delivered;
}

async function sendLatestReport(chatId: string, slug: string): Promise<void> {
  const report = getStoredReports(slug, 1)[0];
  if (!report) {
    await sendMessage(chatId, `No published reports yet. View ${slug} at bowyer.app/agents/${slug}.`);
    return;
  }
  await sendMessage(
    chatId,
    `${report.title}\n\n${report.body}\n\nbowyer.app/agents/${slug}`,
    { inline_keyboard: [[{ text: "Open full report", url: `${SITE}/agents/${slug}` }]] }
  );

  if (slug !== SAMPLE_AGENT) return;
  db()
    .prepare(
      `UPDATE telegram_sample_progress
       SET reports_opened = reports_opened + 1, updated_at = ?
       WHERE chat_id = ?`
    )
    .run(new Date().toISOString(), chatId);
  const progress = db()
    .prepare("SELECT reports_opened, upgrade_prompted FROM telegram_sample_progress WHERE chat_id = ?")
    .get(chatId) as { reports_opened: number; upgrade_prompted: number } | undefined;
  if (!progress || progress.reports_opened < 2 || progress.upgrade_prompted) return;

  db()
    .prepare("UPDATE telegram_sample_progress SET upgrade_prompted = 1, updated_at = ? WHERE chat_id = ?")
    .run(new Date().toISOString(), chatId);
  await sendMessage(
    chatId,
    "You have seen Whale Hunter at work. Want it tuned to you? Connect a wallet to unlock private questions, custom alerting, and paid BOWYER agents.",
    { inline_keyboard: [[{ text: "Unlock my agent workspace", url: `${SITE}/portfolio` }]] }
  );
}

export async function handleTelegramUpdate(update: {
  message?: { chat: { id: number }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
}): Promise<void> {
  const callback = update.callback_query;
  if (callback?.message?.chat?.id && callback.data) {
    await answerCallbackQuery(callback.id);
    const walletRow = db()
      .prepare("SELECT wallet FROM telegram_links WHERE chat_id = ?")
      .get(String(callback.message.chat.id)) as { wallet: string } | undefined;
    await handleMenuAction(String(callback.message.chat.id), callback.data, walletRow?.wallet);
    return;
  }
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const wallet = db()
    .prepare("SELECT wallet FROM telegram_links WHERE chat_id = ?")
    .get(chatId) as { wallet: string } | undefined;

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1]?.replace(/^ref_/, "");
    if (code) {
      db()
        .prepare(
          `UPDATE telegram_referrals SET referred_chat_id = ?, claimed_at = ?
           WHERE code = ? AND referred_chat_id IS NULL AND referrer_chat_id <> ?`
        )
        .run(chatId, new Date().toISOString(), code, chatId);
    }
    installDefaultAgents(chatId);
    await sendStartMenu(chatId);
    await sendSampleSignal(chatId);
    return;
  }

  if (text.startsWith("/menu")) {
    await sendStartMenu(chatId);
    return;
  }

  if (text.startsWith("/briefing")) {
    await sendBriefing(chatId);
    return;
  }

  if (text.startsWith("/referral") || text.startsWith("/invite")) {
    await handleMenuAction(chatId, "cta:referral");
    return;
  }

  if (text.startsWith("/myid")) {
    await sendMessage(chatId, `Your Telegram chat ID:\n\n${chatId}\n\nAdd to TELEGRAM_DEMO_CHAT_IDS for screenshot access without subscribing.`);
    return;
  }

  if (text.startsWith("/demo")) {
    if (!demoModeEnabled()) {
      await sendMessage(
        chatId,
        "Demo mode is off on this server.\n\nQuick option: /use whale-hunter — chat works without subscribing.\n\nFor Robinhood screenshots, an operator can set TELEGRAM_DEMO_MODE=1 or add your chat ID from /myid to TELEGRAM_DEMO_CHAT_IDS."
      );
      return;
    }
    const { slug } = grantTelegramDemoAccess(chatId);
    const agent = getAgentSummary(slug);
    await sendMessage(
      chatId,
      [
        `Demo access granted — ${agent?.name ?? slug} chat is unlocked.`,
        "",
        "Try these for a good screenshot:",
        "• What's a sensible max position size for a single equity?",
        "• How do I set hard risk limits before going live?",
        "• Walk me through connecting my Robinhood Agentic Account.",
        "",
        "Just send any of those as a normal message.",
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
    if (!slug) {
      await sendMessage(
        chatId,
        "Choose a business to follow. Whale Hunter is the live Robinhood Chain intelligence agent.",
        {
          inline_keyboard: [
            [{ text: "View Whale Hunter", url: `${SITE}/agents/whale-hunter` }],
            [{ text: "Explore all businesses", url: `${SITE}/marketplace` }],
            [{ text: "Open bot menu", callback_data: "cta:whale" }],
          ],
        }
      );
      return;
    }
    const result = followBusiness(chatId, slug);
    await sendMessage(chatId, result.message);
    return;
  }

  if (text.startsWith("/agents")) {
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
      const isSample = slug === SAMPLE_AGENT;
      const access = isSample
        ? "included sample"
        : canChatWithAgent(slug, wallet?.wallet, chatId).ok
          ? "chat enabled"
          : catalogRequiresSubscription(slug)
            ? "reports only"
            : "free chat";
      const active = resolveActiveAgentSlug(chatId) === slug ? " ← active" : "";
      return `• ${agent.name} — ${access}${active}`;
    });
    await sendMessage(chatId, `Your businesses\n\n${lines.join("\n")}\n\nSend a message to chat with the active agent, or /use slug to switch.`);
    return;
  }

  if (text.startsWith("/use")) {
    const slug = text.split(/\s+/)[1]?.trim().toLowerCase() ?? "";
    if (!slug) {
      await sendMessage(chatId, `Your active agent is ${resolveActiveAgentSlug(chatId)}. Usage: /use slug`);
      return;
    }
    await selectAgentForChat(chatId, slug, wallet?.wallet);
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
    await sendLatestReport(chatId, slug);
    return;
  }

  if (text.startsWith("/scan")) {
    const address = text.split(/\s+/)[1]?.trim() ?? "";
    if (!address) {
      await sendMessage(chatId, "Paste an EVM token address to inspect it.\n\nExample: /scan 0x...");
      return;
    }
    try {
      const scan = await scanTokenRisk(address);
      const flags = scan.flags.length ? scan.flags.map((flag) => `• ${flag}`).join("\n") : "• No basic metadata flags found";
      await sendMessage(
        chatId,
        [
          `HOOD MEME RADAR · ${scan.symbol ?? "UNKNOWN"}`,
          "",
          `Risk: ${scan.riskLevel.toUpperCase()} (${scan.riskScore}/100)`,
          `Contract: ${scan.address}`,
          `Bytecode: ${scan.bytecodeBytes.toLocaleString()} bytes`,
          `Metadata: ${scan.name ?? "unknown"}${scan.decimals != null ? ` · ${scan.decimals} decimals` : ""}`,
          scan.market
            ? `DEX: ${scan.market.dexId} · $${scan.market.liquidityUsd?.toLocaleString() ?? "?"} liquidity · $${scan.market.volume24h?.toLocaleString() ?? "?"} volume (24h)`
            : "DEX: no pool found on the configured Robinhood Chain DexScreener feed",
          "",
          "Flags",
          flags,
          "",
          "This is an EVM contract inspection, not a safety guarantee or trading advice.",
        ].join("\n"),
        { inline_keyboard: [[{ text: "Open full scanner", url: `${SITE}/api/meme-radar?address=${scan.address}` }]] }
      );
    } catch (error) {
      await sendMessage(chatId, error instanceof Error ? error.message : "Token scan failed. Try a valid EVM address.");
    }
    return;
  }

  if (text.startsWith("/help")) {
    await sendMessage(
      chatId,
      [
        "Talk to your agent:",
        "Just send a message — no /ask needed.",
        "",
        "Commands:",
        "/menu — shortcuts and agent list",
        "/agents — see followed agents + active chat",
        "/use slug — switch chat agent",
        "/latest [slug] — newest report",
        "/briefing — today's digest",
        "/scan 0x… — memecoin contract scan",
        "/follow slug — report delivery",
        "",
        "Robinhood Trading Agent chat: link wallet + claim free POC at bowyer.app.",
      ].join("\n")
    );
    return;
  }

  const question = text.startsWith("/ask") ? text.replace(/^\/ask(?:@\w+)?\s*/i, "").trim() : text;
  if (!question || question.startsWith("/")) {
    await sendMessage(chatId, "Send a message to chat with your agent, or type /help.");
    return;
  }

  await handleAgentChat(chatId, question, wallet?.wallet);
}
