/**
 * Voice calls with agents: speech-to-text via the platform LLM provider
 * (Groq hosts Whisper on the same OpenAI-compatible API) and text-to-speech
 * via ElevenLabs, with a distinct voice per flagship agent.
 */

import { db } from "@/lib/db";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
/** Low-latency model — quality is close to multilingual v2 at ~2x speed. */
const ELEVENLABS_MODEL = "eleven_turbo_v2_5";
const STT_MODEL = process.env.STT_MODEL ?? "whisper-large-v3-turbo";

/** ElevenLabs premade voice ids, matched to each flagship persona. */
const AGENT_VOICE_IDS: Record<string, string> = {
  // Daniel — measured British baritone; reads like a sell-side macro head.
  "atlas-macro": "onwK4e9ZLuTAKqWW03F9",
  // Charlotte — low, deliberate; fits the forensic investigator register.
  "nyx-forensics": "XB0fDUnXU5powFXDhCwa",
  // Charlie — quick, energetic; matches the narrative-velocity persona.
  "vega-narrative": "IKne3meq5aSn9XLyUdCD",
};

/** Brian — deep, neutral narrator; default for every other business. */
const DEFAULT_VOICE_ID = "nPczCjzI2devNBz1zQrb";

export function voiceConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim() && process.env.LLM_API_KEY?.trim());
}

export function voiceIdForAgent(slug: string): string {
  return AGENT_VOICE_IDS[slug] ?? DEFAULT_VOICE_ID;
}

/** Transcribe caller audio (webm/mp4/wav) to text. */
export async function transcribeAudio(audio: Blob, filename: string): Promise<string> {
  const apiKey = (process.env.STT_API_KEY ?? process.env.LLM_API_KEY)?.trim();
  const baseUrl = (process.env.STT_BASE_URL ?? process.env.LLM_BASE_URL)?.trim();
  if (!apiKey || !baseUrl) throw new Error("STT is not configured");

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", STT_MODEL);
  form.append("response_format", "json");

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Raw provider payloads stay in server logs — never on a caller's screen.
    console.error(`[voice] STT ${STT_MODEL} -> HTTP ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error(
      res.status === 429
        ? "Transcription is at capacity right now — try again in a moment."
        : "Could not transcribe the audio. Try again."
    );
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Synthesize the agent's spoken reply. Returns MP3 bytes. */
export async function synthesizeSpeech(slug: string, text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

  const res = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${voiceIdForAgent(slug)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2 },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[voice] TTS voice=${voiceIdForAgent(slug)} -> HTTP ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error("Voice synthesis failed — the answer is available as text.");
  }
  return Buffer.from(await res.arrayBuffer());
}

export interface VoiceCallRecord {
  id: number;
  slug: string;
  caller: string;
  question: string;
  answer: string;
  free: boolean;
  at: string;
}

function ensureVoiceTables() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS voice_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      caller TEXT NOT NULL,           -- lowercase wallet or ip:<addr> for teaser callers
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      free INTEGER NOT NULL DEFAULT 0,
      share_token TEXT,               -- capability token for the public clip page
      has_audio INTEGER NOT NULL DEFAULT 0,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_voice_calls_caller
      ON voice_calls (slug, caller, at DESC);
  `);
  const cols = db().prepare("PRAGMA table_info(voice_calls)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "share_token")) {
    db().exec("ALTER TABLE voice_calls ADD COLUMN share_token TEXT");
  }
  if (!cols.some((c) => c.name === "has_audio")) {
    db().exec("ALTER TABLE voice_calls ADD COLUMN has_audio INTEGER NOT NULL DEFAULT 0");
  }
}

export const FREE_VOICE_QUESTIONS_PER_DAY = 3;

/** How many free teaser questions this caller has left today for this agent. */
export function freeVoiceQuestionsLeft(slug: string, caller: string): number {
  ensureVoiceTables();
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM voice_calls
       WHERE slug = ? AND caller = ? AND free = 1 AND at >= datetime('now', '-1 day')`
    )
    .get(slug, caller.toLowerCase()) as { n: number };
  return Math.max(0, FREE_VOICE_QUESTIONS_PER_DAY - row.n);
}

export function recordVoiceCall(input: {
  slug: string;
  caller: string;
  question: string;
  answer: string;
  free: boolean;
  hasAudio?: boolean;
}): { id: number; shareToken: string } {
  ensureVoiceTables();
  const shareToken = randomToken();
  const result = db()
    .prepare(
      `INSERT INTO voice_calls (slug, caller, question, answer, free, share_token, has_audio, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      input.slug,
      input.caller.toLowerCase(),
      input.question,
      input.answer,
      input.free ? 1 : 0,
      shareToken,
      input.hasAudio ? 1 : 0
    );
  return { id: Number(result.lastInsertRowid), shareToken };
}

function randomToken(): string {
  const req = eval("require") as NodeRequire;
  const { randomBytes } = req("node:crypto") as typeof import("node:crypto");
  return randomBytes(12).toString("hex");
}

export interface VoiceClip {
  id: number;
  slug: string;
  question: string;
  answer: string;
  hasAudio: boolean;
  at: string;
}

/** Fetch a clip by id + capability token (the share link is the auth). */
export function getVoiceClip(id: number, token: string): VoiceClip | null {
  ensureVoiceTables();
  const row = db()
    .prepare(
      `SELECT id, slug, question, answer, has_audio, at FROM voice_calls
       WHERE id = ? AND share_token = ? AND share_token IS NOT NULL`
    )
    .get(id, token) as
    | { id: number; slug: string; question: string; answer: string; has_audio: number; at: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    question: row.question,
    answer: row.answer,
    hasAudio: row.has_audio === 1,
    at: row.at,
  };
}

/** Clip audio lives beside the DB (same volume as forged models). */
export function clipAudioPath(id: number): string {
  const req = eval("require") as NodeRequire;
  const path = req("node:path") as typeof import("node:path");
  const dbPath = process.env.BOWYER_DB_PATH ?? path.join(process.cwd(), "data", "bowyer.db");
  return path.join(path.dirname(dbPath), "clips", `${id}.mp3`);
}

export async function saveClipAudio(id: number, audio: Buffer): Promise<void> {
  const req = eval("require") as NodeRequire;
  const fs = req("node:fs/promises") as typeof import("node:fs/promises");
  const path = req("node:path") as typeof import("node:path");
  const dest = clipAudioPath(id);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, audio);
}

/** Recent turns for conversational continuity in a call. */
export function recentVoiceHistory(
  slug: string,
  caller: string,
  limit = 4
): { role: "user" | "assistant"; content: string }[] {
  ensureVoiceTables();
  const rows = db()
    .prepare(
      `SELECT question, answer FROM voice_calls
       WHERE slug = ? AND caller = ? ORDER BY id DESC LIMIT ?`
    )
    .all(slug, caller.toLowerCase(), limit) as { question: string; answer: string }[];
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const row of rows.reverse()) {
    turns.push({ role: "user", content: row.question });
    turns.push({ role: "assistant", content: row.answer });
  }
  return turns;
}
