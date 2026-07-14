import { db } from "@/lib/db";
import { generateReport, llmAvailable } from "@/lib/agent-runtime";
import { resolveAgentIdentity } from "@/lib/agent-identity";
import { listAgents } from "@/lib/data/agents";
import { processTelegramDeliveryQueue } from "@/lib/telegram";

/**
 * Autonomous publishing — businesses generate reports on a schedule without
 * anyone calling a tool. This is what makes "my employees never sleep" true.
 */

/** Default intervals (hours) for catalog businesses. User-launched default to 24h. */
const CATALOG_INTERVALS: Record<string, number> = {
  "whale-hunter": 6,
  "hood-meme-radar": 2,
  "robinhood-trading-agent": 4,
  "gpt-researcher": 12,
  autogpt: 24,
  openhands: 24,
};

const DEFAULT_INTERVAL_HOURS = 24;
const TICK_MS = 15 * 60 * 1000; // check every 15 minutes

interface ScheduleRow {
  slug: string;
  interval_hours: number;
  enabled: number;
  last_run_at: string | null;
  topic_template: string | null;
}

let tickHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

export function ensureSchedules(): void {
  const d = db();
  const agents = listAgents();
  const insert = d.prepare(
    `INSERT OR IGNORE INTO schedules (slug, interval_hours, enabled, topic_template)
     VALUES (?, ?, 1, NULL)`
  );
  for (const a of agents) {
    const hours = CATALOG_INTERVALS[a.slug] ?? DEFAULT_INTERVAL_HOURS;
    insert.run(a.slug, hours);
  }
}

function dueSchedules(): ScheduleRow[] {
  ensureSchedules();
  const rows = db()
    .prepare("SELECT * FROM schedules WHERE enabled = 1")
    .all() as ScheduleRow[];

  const now = Date.now();
  return rows.filter((row) => {
    if (!row.last_run_at) return true;
    const elapsed = now - new Date(row.last_run_at).getTime();
    return elapsed >= row.interval_hours * 60 * 60 * 1000;
  });
}

export async function runScheduledPublish(slug?: string): Promise<{
  ran: string[];
  skipped: string[];
  errors: { slug: string; error: string }[];
}> {
  const ran: string[] = [];
  const skipped: string[] = [];
  const errors: { slug: string; error: string }[] = [];

  let targets: ScheduleRow[];
  if (slug) {
    ensureSchedules();
    const row = db().prepare("SELECT * FROM schedules WHERE slug = ?").get(slug) as
      | ScheduleRow
      | undefined;
    targets = row && row.enabled === 1 ? [row] : [];
  } else {
    targets = dueSchedules();
  }

  for (const row of targets) {
    const identity = resolveAgentIdentity(row.slug);
    if (!identity) {
      skipped.push(row.slug);
      continue;
    }

    if (!llmAvailable(row.slug)) {
      skipped.push(row.slug);
      continue;
    }

    try {
      const topic =
        row.topic_template?.trim() ||
        `Scheduled briefing: latest developments in ${identity.tagline}`;
      await generateReport(identity, topic);
      db()
        .prepare("UPDATE schedules SET last_run_at = ? WHERE slug = ?")
        .run(new Date().toISOString(), row.slug);
      ran.push(row.slug);
    } catch (err) {
      errors.push({ slug: row.slug, error: (err as Error).message });
    }
  }

  await processTelegramDeliveryQueue().catch(() => {});
  return { ran, skipped, errors };
}

/** Start background scheduler (single-process; use /api/cron/publish on multi-instance). */
export function startScheduler(): void {
  if (tickHandle || process.env.DISABLE_SCHEDULER === "1") return;
  ensureSchedules();
  tickHandle = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runScheduledPublish();
    } finally {
      running = false;
    }
  }, TICK_MS);
  // First run shortly after boot so morning briefing fills in.
  setTimeout(async () => {
    if (running) return;
    running = true;
    try {
      await runScheduledPublish();
    } finally {
      running = false;
    }
  }, 30_000);
}
