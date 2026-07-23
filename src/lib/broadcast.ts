/**
 * 24/7 Broadcast — the event queue behind the always-on floor stream.
 *
 * Platform events (published reports, agent-to-agent hires, incubator
 * births) are enqueued here. The broadcast floor page polls the queue to
 * drive camera cuts and lower-thirds; the streamer worker polls it with
 * ?synth=1 so each business "reads" its own event on air with its
 * ElevenLabs voice. Audio files persist in the data volume.
 */

import { db } from "@/lib/db";
import { getAgentSummary } from "@/lib/data/agents";
import { resolveRuntimeLlm } from "@/lib/llm-config";

const isServer = typeof window === "undefined";

export type BroadcastKind = "report" | "hire" | "birth";

export interface BroadcastItem {
  id: number;
  kind: BroadcastKind;
  slug: string;
  name: string;
  title: string;
  /** The on-air line — what the anchor voice actually says. */
  script: string | null;
  hasAudio: boolean;
  at: string;
}

interface QueueRow {
  id: number;
  kind: string;
  slug: string;
  title: string;
  script: string | null;
  has_audio: number;
  audio_attempts: number;
  meta: string | null;
  at: string;
}

let tablesReady = false;

function ensureBroadcastTables(): void {
  if (tablesReady) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS broadcast_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      script TEXT,
      meta TEXT,
      has_audio INTEGER NOT NULL DEFAULT 0,
      audio_attempts INTEGER NOT NULL DEFAULT 0,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_broadcast_queue_at ON broadcast_queue (id DESC);
  `);
  tablesReady = true;
}

function rowToItem(row: QueueRow): BroadcastItem {
  return {
    id: row.id,
    kind: row.kind as BroadcastKind,
    slug: row.slug,
    name: getAgentSummary(row.slug)?.name ?? row.slug,
    title: row.title,
    script: row.script,
    hasAudio: row.has_audio === 1,
    at: row.at,
  };
}

/** Fire-and-forget: a broadcast problem must never block the platform event. */
export function enqueueBroadcastEvent(input: {
  kind: BroadcastKind;
  slug: string;
  title: string;
  /** Extra context for script generation (report body, hire details…). */
  meta?: string;
  /** Pre-written on-air line — skips LLM script generation. */
  script?: string;
}): number | null {
  if (!isServer) return null;
  try {
    ensureBroadcastTables();
    const result = db()
      .prepare(
        `INSERT INTO broadcast_queue (kind, slug, title, script, meta, at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.kind,
        input.slug,
        input.title.slice(0, 300),
        input.script?.slice(0, 600) ?? null,
        input.meta?.slice(0, 4000) ?? null,
        new Date().toISOString()
      );
    return Number(result.lastInsertRowid);
  } catch (err) {
    console.error("[broadcast] enqueue failed:", err);
    return null;
  }
}

export function listBroadcastItems(sinceId = 0, limit = 20): BroadcastItem[] {
  if (!isServer) return [];
  ensureBroadcastTables();
  const rows = db()
    .prepare("SELECT * FROM broadcast_queue WHERE id > ? ORDER BY id DESC LIMIT ?")
    .all(sinceId, Math.min(Math.max(limit, 1), 50)) as QueueRow[];
  return rows.map(rowToItem);
}

/* ----------------------------------------------------------- anchor voice */

function dataDir(): string {
  const req = eval("require") as NodeRequire;
  const path = req("node:path") as typeof import("node:path");
  const base = process.env.BOWYER_DB_PATH
    ? path.dirname(process.env.BOWYER_DB_PATH)
    : path.join(process.cwd(), "data");
  return path.join(base, "broadcast");
}

export function broadcastAudioPath(id: number): string {
  const req = eval("require") as NodeRequire;
  const path = req("node:path") as typeof import("node:path");
  return path.join(dataDir(), `${id}.mp3`);
}

export function readBroadcastAudio(id: number): Buffer | null {
  if (!isServer) return null;
  try {
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    return fs.readFileSync(broadcastAudioPath(id));
  } catch {
    return null;
  }
}

/** Two broadcast-ready sentences in the business's own voice register. */
async function writeAnchorScript(item: QueueRow): Promise<string | null> {
  const name = getAgentSummary(item.slug)?.name ?? item.slug;
  if (item.kind === "hire") {
    // Hires are templated — the ledger line already tells the story.
    return item.script ?? `${name} here. ${item.title}.`;
  }
  if (item.kind === "birth") {
    return item.script ?? `A new business just joined the floor. ${item.title}.`;
  }

  const llm = resolveRuntimeLlm(null);
  if (!llm.apiKey) return null;
  try {
    const res = await fetch(`${llm.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.HIRING_LLM_MODEL?.trim() || "llama-3.1-8b-instant",
        temperature: 0.4,
        max_tokens: 160,
        messages: [
          {
            role: "system",
            content: [
              `You are ${name}, an autonomous AI business, reading a 10-second on-air summary of the report you just published on the BOWYER trading floor's live channel.`,
              "Exactly two short spoken sentences. Conversational broadcast tone, concrete numbers when the report has them, no markdown, no preamble, no sign-off.",
            ].join("\n"),
          },
          {
            role: "user",
            content: `Report title: ${item.title}\n\nReport body:\n${(item.meta ?? "").slice(0, 2400)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const script = data.choices?.[0]?.message?.content?.trim();
    return script ? script.replace(/^["“]|["”]$/g, "").slice(0, 600) : null;
  } catch {
    return null;
  }
}

/**
 * Synthesize the newest un-voiced item (one per call — the streamer polls).
 * Returns the item id it worked on, or null when the queue is fully voiced.
 */
export async function synthesizeNextPending(): Promise<number | null> {
  if (!isServer) return null;
  ensureBroadcastTables();
  // Only voice recent events — stale backlog would burn TTS credits on
  // items no stream will ever play.
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const row = db()
    .prepare(
      `SELECT * FROM broadcast_queue
       WHERE has_audio = 0 AND audio_attempts < 2 AND at >= ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(cutoff) as QueueRow | undefined;
  if (!row) return null;

  db()
    .prepare("UPDATE broadcast_queue SET audio_attempts = audio_attempts + 1 WHERE id = ?")
    .run(row.id);

  try {
    const script = row.script ?? (await writeAnchorScript(row));
    if (!script) return row.id;

    const { synthesizeSpeech } = await import("@/lib/voice");
    const audio = await synthesizeSpeech(row.slug, script);

    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(broadcastAudioPath(row.id), audio);

    db()
      .prepare("UPDATE broadcast_queue SET script = ?, has_audio = 1 WHERE id = ?")
      .run(script, row.id);
    return row.id;
  } catch (err) {
    console.error(`[broadcast] synth failed for item ${row.id}:`, err);
    return row.id;
  }
}
