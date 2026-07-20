import type { AgentSummary } from "@/lib/types";
import type { AgentLlmConfig } from "@/lib/llm-config";
import { db } from "@/lib/db";

function cryptoStore(): { encryptSecret(value: string): string; decryptSecret(value: string): string | null } {
  // This module is transitively imported by client catalog components. Hide the
  // Node crypto dependency from webpack and invoke it only in server DB paths.
  const req = eval("require") as NodeRequire;
  return req("../oauth/crypto") as { encryptSecret(value: string): string; decryptSecret(value: string): string | null };
}

/**
 * SQLite-backed registry for user-launched agents and subscriptions.
 * Data survives server restarts (stored in ./data/bowyer.db).
 */

export interface KnowledgeSource {
  /** website | github | rss */
  type: string;
  url: string;
}

export interface RegisterAgentInput {
  name: string;
  tagline: string;
  category: string;
  description: string;
  revenueModel: string;
  priceUsd: number;
  creatorSharePct: number;
  mcpEndpoint?: string;
  /** Wallet address that receives subscriber payments. Required for paid agents. */
  payoutAddress?: string;
  /** Wallet that launched the business — used for the owner's portfolio. */
  ownerAddress?: string;
  /** Live knowledge sources the runtime reads when generating output. */
  sources?: KnowledgeSource[];
  /** Which LLM powers this business (platform-hosted or founder's own key). */
  llm?: AgentLlmConfig;
}

export interface SubscriptionRecord {
  slug: string;
  subscriber: string;
  txHash?: string;
  amountUsd: number;
  at: string;
  active?: boolean;
}

const CATEGORY_TO_FILTER: Record<string, AgentSummary["filter"]> = {
  Trading: "trading",
  Macro: "research",
  Research: "research",
  Security: "data",
  Content: "content",
  Developer: "developer-tools",
  Data: "data",
  Automation: "automation",
};

/**
 * Client components may transitively import this module via agents.ts.
 * The database only exists on the server, so every read degrades to an
 * empty result in the browser (server-rendered data still hydrates fine).
 */
const isServer = typeof window === "undefined";

interface AgentRow {
  slug: string;
  summary: string;
  description: string;
  mcp_endpoint: string | null;
  payout_address: string | null;
  owner_address: string | null;
}

interface SubRow {
  slug: string;
  subscriber: string;
  tx_hash: string | null;
  amount_usd: number;
  at: string;
  active: number;
}

function rowToSummary(row: AgentRow): AgentSummary {
  return JSON.parse(row.summary) as AgentSummary;
}

function rowToSub(row: SubRow): SubscriptionRecord {
  return {
    slug: row.slug,
    subscriber: row.subscriber,
    txHash: row.tx_hash ?? undefined,
    amountUsd: row.amount_usd,
    at: row.at,
    active: row.active === 1,
  };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export function registerAgent(input: RegisterAgentInput): { slug: string } {
  const d = db();
  let slug = slugify(input.name);
  if (!slug) slug = `agent-${Date.now()}`;
  const exists = d.prepare("SELECT 1 FROM agents WHERE slug = ?").get(slug);
  if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const now = new Date().toISOString().slice(0, 10);
  const filter = CATEGORY_TO_FILTER[input.category] ?? "research";

  const summary: AgentSummary = {
    id: `agent-user-${Date.now()}`,
    slug,
    name: input.name,
    tagline: input.tagline,
    thesis: input.description.slice(0, 140),
    currentTask: "Initializing — first scan queued",
    category: "analytics",
    filter,
    status: "live",
    riskLevel: "medium",
    creator: { name: input.name, handle: slugify(input.name), verified: false },
    pricing:
      input.priceUsd <= 0 || input.revenueModel === "Free"
        ? { model: "free", amount: 0, currency: "USD" }
        : {
            model: input.revenueModel === "One-time license" ? "one-time" : "subscription",
            amount: input.priceUsd,
            currency: "USD",
            period: "month",
          },
    performance: {
      totalReturnPct: 0,
      return30dPct: 0,
      winRatePct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      asOf: now,
    },
    primaryMetric: { label: "Status", value: "Just launched" },
    followers: 0,
    revenueUsd: 0,
    artwork: "abstract",
    featured: false,
    trendingScore: 10,
    createdAt: now,
    tags: [input.category.toLowerCase()],
    profileReady: true,
    artifactKind: "agent",
    version: "0.1.0",
    platforms: ["agent-fun"],
    stars: 0,
  };

  d.prepare(
    `INSERT INTO agents (slug, summary, description, mcp_endpoint, payout_address, owner_address, sources, llm_config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    slug,
    JSON.stringify(summary),
    input.description,
    input.mcpEndpoint ?? null,
    input.payoutAddress?.toLowerCase() ?? null,
    (input.ownerAddress ?? input.payoutAddress)?.toLowerCase() ?? null,
    input.sources && input.sources.length > 0 ? JSON.stringify(input.sources) : null,
    input.llm
      ? JSON.stringify(
          input.llm.mode === "custom" && input.llm.apiKey
            ? { ...input.llm, apiKey: cryptoStore().encryptSecret(input.llm.apiKey) }
            : input.llm
        )
      : null
  );

  return { slug };
}

/** Knowledge sources a business was launched with (empty for catalog agents). */
export function getAgentSources(slug: string): KnowledgeSource[] {
  if (!isServer) return [];
  const row = db()
    .prepare("SELECT sources FROM agents WHERE slug = ?")
    .get(slug) as { sources: string | null } | undefined;
  if (!row?.sources) return [];
  try {
    const parsed = JSON.parse(row.sources) as KnowledgeSource[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getAgentLlmConfig(slug: string): AgentLlmConfig | null {
  if (!isServer) return null;
  const row = db()
    .prepare("SELECT llm_config FROM agents WHERE slug = ?")
    .get(slug) as { llm_config: string | null } | undefined;
  if (!row?.llm_config) return null;
  try {
    const config = JSON.parse(row.llm_config) as AgentLlmConfig;
    if (config.mode !== "custom" || !config.apiKey) return config;
    const decrypted = cryptoStore().decryptSecret(config.apiKey);
    if (decrypted) return { ...config, apiKey: decrypted };

    // Safely migrate legacy plaintext entries the first time they are read.
    const encrypted = cryptoStore().encryptSecret(config.apiKey);
    db()
      .prepare("UPDATE agents SET llm_config = ? WHERE slug = ?")
      .run(JSON.stringify({ ...config, apiKey: encrypted }), slug);
    return config;
  } catch {
    return null;
  }
}

export function getAgentOwnerAddress(slug: string): string | null {
  if (!isServer) return null;
  const row = db()
    .prepare("SELECT owner_address FROM agents WHERE slug = ?")
    .get(slug) as { owner_address: string | null } | undefined;
  return row?.owner_address ?? null;
}

export interface UpdateAgentInput {
  name?: string;
  tagline?: string;
  description?: string;
  priceUsd?: number;
  payoutAddress?: string;
  sources?: KnowledgeSource[];
}

/**
 * Update an owner's launched business. The slug (and its MCP endpoint) stays
 * stable so existing subscribers and integrations keep working.
 * Caller is responsible for verifying the requester owns the agent.
 */
export function updateRegisteredAgent(slug: string, input: UpdateAgentInput): boolean {
  if (!isServer) return false;
  const d = db();
  const row = d.prepare("SELECT * FROM agents WHERE slug = ?").get(slug) as AgentRow | undefined;
  if (!row) return false;

  const summary = JSON.parse(row.summary) as AgentSummary;
  if (input.name?.trim()) summary.name = input.name.trim().slice(0, 60);
  if (input.tagline?.trim()) summary.tagline = input.tagline.trim().slice(0, 140);
  if (input.description?.trim()) summary.thesis = input.description.trim().slice(0, 140);
  if (input.priceUsd !== undefined && Number.isFinite(input.priceUsd) && input.priceUsd >= 0) {
    summary.pricing =
      input.priceUsd <= 0
        ? { model: "free", amount: 0, currency: "USD" }
        : { model: "subscription", amount: Math.min(input.priceUsd, 10_000), currency: "USD", period: "month" };
  }

  const sets: string[] = ["summary = ?"];
  const values: unknown[] = [JSON.stringify(summary)];
  if (input.description?.trim()) {
    sets.push("description = ?");
    values.push(input.description.trim().slice(0, 4000));
  }
  if (input.payoutAddress && /^0x[0-9a-fA-F]{40}$/.test(input.payoutAddress)) {
    sets.push("payout_address = ?");
    values.push(input.payoutAddress.toLowerCase());
  }
  if (input.sources) {
    sets.push("sources = ?");
    values.push(input.sources.length > 0 ? JSON.stringify(input.sources.slice(0, 8)) : null);
  }
  values.push(slug);
  d.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE slug = ?`).run(...values);
  return true;
}

export function listAgentsByOwner(owner: string): AgentSummary[] {
  if (!isServer) return [];
  const rows = db()
    .prepare("SELECT * FROM agents WHERE owner_address = ? ORDER BY created_at DESC")
    .all(owner.toLowerCase()) as AgentRow[];
  return rows.map(rowToSummary);
}

/** All payments received by businesses owned by this wallet. */
export function listEarnings(owner: string): SubscriptionRecord[] {
  if (!isServer) return [];
  const rows = db()
    .prepare(
      `SELECT s.* FROM subscriptions s
       JOIN agents a ON a.slug = s.slug
       WHERE a.owner_address = ?
       ORDER BY s.at DESC`
    )
    .all(owner.toLowerCase()) as SubRow[];
  return rows.map(rowToSub);
}

/**
 * Payout address for the platform's own flagship agent (Whale Hunter).
 * MUST be a wallet you control — set PLATFORM_PAYOUT_ADDRESS in the server env.
 * If unset, paid subscriptions fail safely instead of sending ETH to a void.
 */
function platformPayout(): string | null {
  const addr = process.env.PLATFORM_PAYOUT_ADDRESS;
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr : null;
}

export function getPayoutAddress(slug: string): string | null {
  if (!isServer) return slug === "whale-hunter" ? platformPayout() : null;
  const row = db()
    .prepare("SELECT payout_address FROM agents WHERE slug = ?")
    .get(slug) as { payout_address: string | null } | undefined;
  if (row?.payout_address) return row.payout_address;
  return slug === "whale-hunter" ? platformPayout() : null;
}

export function recordSubscription(record: SubscriptionRecord): void {
  const d = db();
  d.prepare(
    `INSERT INTO subscriptions (slug, subscriber, tx_hash, amount_usd, at, active)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(
    record.slug,
    record.subscriber.toLowerCase(),
    record.txHash ?? null,
    record.amountUsd,
    record.at
  );

  const row = d.prepare("SELECT * FROM agents WHERE slug = ?").get(record.slug) as
    | AgentRow
    | undefined;
  if (row) {
    const summary = rowToSummary(row);
    summary.followers += 1;
    summary.revenueUsd += record.amountUsd;
    d.prepare("UPDATE agents SET summary = ? WHERE slug = ?").run(
      JSON.stringify(summary),
      record.slug
    );
  }
}

export function cancelSubscription(slug: string, subscriber: string): boolean {
  if (!isServer) return false;
  const result = db()
    .prepare(
      "UPDATE subscriptions SET active = 0 WHERE slug = ? AND subscriber = ? AND active = 1"
    )
    .run(slug, subscriber.toLowerCase());
  return result.changes > 0;
}

export function listSubscriptions(subscriber?: string): SubscriptionRecord[] {
  if (!isServer) return [];
  const d = db();
  const rows = (
    subscriber
      ? d
          .prepare(
            "SELECT * FROM subscriptions WHERE subscriber = ? AND active = 1 ORDER BY at DESC"
          )
          .all(subscriber.toLowerCase())
      : d.prepare("SELECT * FROM subscriptions WHERE active = 1 ORDER BY at DESC").all()
  ) as SubRow[];
  return rows.map(rowToSub);
}

export function hasSubscription(slug: string, subscriber: string): boolean {
  if (!isServer) return false;
  return Boolean(
    db()
      .prepare(
        "SELECT 1 FROM subscriptions WHERE slug = ? AND subscriber = ? AND active = 1"
      )
      .get(slug, subscriber.toLowerCase())
  );
}

export function countActiveSubscriptionsForAgent(slug: string): number {
  if (!isServer) return 0;
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE slug = ? AND active = 1")
    .get(slug) as { n: number };
  return row.n;
}

/** Whether a tx hash has already been used to pay for a subscription. */
export function isTxHashUsed(txHash: string): boolean {
  if (!isServer) return false;
  return Boolean(
    db().prepare("SELECT 1 FROM subscriptions WHERE tx_hash = ?").get(txHash)
  );
}

/**
 * Permanently delete a DB-registered agent and all of its data
 * (reports, signals, schedules, subscriptions, follows, usage, webhooks).
 * Only works for launched agents — built-in catalog agents are not in this table.
 */
export function removeRegisteredAgent(slug: string): boolean {
  if (!isServer) return false;
  const d = db();
  const exists = d.prepare("SELECT 1 FROM agents WHERE slug = ?").get(slug);
  if (!exists) return false;
  const run = d.transaction(() => {
    d.prepare(
      "DELETE FROM signals WHERE report_id IN (SELECT id FROM reports WHERE slug = ?)"
    ).run(slug);
    d.prepare("DELETE FROM reports WHERE slug = ?").run(slug);
    d.prepare("DELETE FROM schedules WHERE slug = ?").run(slug);
    d.prepare("DELETE FROM subscriptions WHERE slug = ?").run(slug);
    d.prepare("DELETE FROM telegram_follows WHERE slug = ?").run(slug);
    d.prepare("DELETE FROM usage_daily WHERE slug = ?").run(slug);
    d.prepare("DELETE FROM mcp_webhooks WHERE slug = ?").run(slug);
    d.prepare("DELETE FROM agents WHERE slug = ?").run(slug);
  });
  run();
  return true;
}

export function listRegisteredAgents(): AgentSummary[] {
  if (!isServer) return [];
  const rows = db()
    .prepare("SELECT * FROM agents WHERE listed = 1 ORDER BY created_at DESC")
    .all() as AgentRow[];
  return rows.map(rowToSummary);
}

/** Marketplace visibility. Unlisted businesses keep working for their owner and
 * existing subscribers, but disappear from listings, stats, and activity. */
export function setAgentListed(slug: string, listed: boolean): boolean {
  if (!isServer) return false;
  const res = db()
    .prepare("UPDATE agents SET listed = ? WHERE slug = ?")
    .run(listed ? 1 : 0, slug);
  return res.changes > 0;
}

export function isAgentListed(slug: string): boolean {
  if (!isServer) return true;
  const row = db()
    .prepare("SELECT listed FROM agents WHERE slug = ?")
    .get(slug) as { listed: number } | undefined;
  // Catalog agents (not in DB) are always listed.
  return row ? row.listed === 1 : true;
}

/** All DB slugs that are currently unlisted (for filtering activity feeds). */
export function listUnlistedSlugs(): string[] {
  if (!isServer) return [];
  const rows = db().prepare("SELECT slug FROM agents WHERE listed = 0").all() as {
    slug: string;
  }[];
  return rows.map((r) => r.slug);
}

export function getRegisteredAgent(slug: string): AgentSummary | null {
  if (!isServer) return null;
  const row = db().prepare("SELECT * FROM agents WHERE slug = ?").get(slug) as
    | AgentRow
    | undefined;
  return row ? rowToSummary(row) : null;
}

export function getRegisteredDescription(slug: string): string | undefined {
  if (!isServer) return undefined;
  const row = db().prepare("SELECT description FROM agents WHERE slug = ?").get(slug) as
    | { description: string }
    | undefined;
  return row?.description || undefined;
}

export function getRegisteredMcpEndpoint(slug: string): string | undefined {
  if (!isServer) return undefined;
  const row = db()
    .prepare("SELECT mcp_endpoint FROM agents WHERE slug = ?")
    .get(slug) as { mcp_endpoint: string | null } | undefined;
  return row?.mcp_endpoint ?? undefined;
}
