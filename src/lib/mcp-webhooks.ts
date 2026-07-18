/**
 * Persisted MCP webhook subscriptions with real delivery.
 * subscribe_webhook stores the registration in SQLite; when an agent
 * publishes a report, every active webhook for that agent receives a
 * signed-shape JSON POST. Repeated failures deactivate the registration.
 */

import { db } from "@/lib/db";

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_FAILURES_BEFORE_DEACTIVATE = 5;

export interface McpWebhook {
  id: string;
  slug: string;
  url: string;
  active: boolean;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  failureCount: number;
}

interface WebhookRow {
  id: string;
  slug: string;
  url: string;
  active: number;
  created_at: string;
  last_delivery_at: string | null;
  last_status: number | null;
  failure_count: number;
}

function rowToWebhook(row: WebhookRow): McpWebhook {
  return {
    id: row.id,
    slug: row.slug,
    url: row.url,
    active: row.active === 1,
    createdAt: row.created_at,
    lastDeliveryAt: row.last_delivery_at,
    lastStatus: row.last_status,
    failureCount: row.failure_count,
  };
}

export function registerWebhook(slug: string, url: string): McpWebhook {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("A valid webhook URL is required");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Webhook URL must be HTTPS");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("Webhook URL must be publicly reachable");
  }

  const existing = db()
    .prepare("SELECT * FROM mcp_webhooks WHERE slug = ? AND url = ?")
    .get(slug, url) as WebhookRow | undefined;
  if (existing) {
    db()
      .prepare("UPDATE mcp_webhooks SET active = 1, failure_count = 0 WHERE id = ?")
      .run(existing.id);
    return rowToWebhook({ ...existing, active: 1, failure_count: 0 });
  }

  const id = `whk_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const createdAt = new Date().toISOString();
  db()
    .prepare(
      "INSERT INTO mcp_webhooks (id, slug, url, active, created_at) VALUES (?, ?, ?, 1, ?)"
    )
    .run(id, slug, url, createdAt);
  return {
    id,
    slug,
    url,
    active: true,
    createdAt,
    lastDeliveryAt: null,
    lastStatus: null,
    failureCount: 0,
  };
}

export function unregisterWebhook(slug: string, subscriptionId: string): boolean {
  const result = db()
    .prepare("UPDATE mcp_webhooks SET active = 0 WHERE slug = ? AND id = ?")
    .run(slug, subscriptionId);
  return result.changes > 0;
}

export function listWebhooks(slug: string): McpWebhook[] {
  const rows = db()
    .prepare("SELECT * FROM mcp_webhooks WHERE slug = ? AND active = 1 ORDER BY created_at")
    .all(slug) as WebhookRow[];
  return rows.map(rowToWebhook);
}

/** POST a published report to every active webhook for the agent. Fire-and-forget. */
export async function deliverReportWebhooks(
  slug: string,
  payload: { reportId: number; title: string; createdAt: string }
): Promise<void> {
  const hooks = listWebhooks(slug);
  if (hooks.length === 0) return;

  const body = JSON.stringify({
    event: "report.published",
    agent: slug,
    report: payload,
    deliveredAt: new Date().toISOString(),
  });

  await Promise.allSettled(
    hooks.map(async (hook) => {
      let status = 0;
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "bowyer-webhooks" },
          body,
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });
        status = res.status;
      } catch {
        status = 0;
      }
      const ok = status >= 200 && status < 300;
      const failureCount = ok ? 0 : hook.failureCount + 1;
      db()
        .prepare(
          `UPDATE mcp_webhooks
           SET last_delivery_at = ?, last_status = ?, failure_count = ?, active = ?
           WHERE id = ?`
        )
        .run(
          new Date().toISOString(),
          status,
          failureCount,
          failureCount >= MAX_FAILURES_BEFORE_DEACTIVATE ? 0 : 1,
          hook.id
        );
    })
  );
}
