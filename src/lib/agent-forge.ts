/**
 * Auto-forge: every new business gets its own rigged three.ws 3D body.
 *
 * Pipeline (same one that produced the flagship robots, ported from the
 * proven Python scripts): text prompt -> three.ws Forge -> rig -> download
 * -> anonymize mixamo bone names (keeps the viewer in natural rest pose)
 * -> store on the data volume, served via /api/models/[slug].
 */

import { db } from "@/lib/db";
import { AGENT_AVATAR_GLB } from "@/lib/agent-avatars";
import { agentSummaries } from "@/lib/data/agents";

// Node built-ins are eval-required (db.ts pattern) so this module stays
// importable from the instrumentation/scheduler webpack graph.
function nodeFs(): typeof import("node:fs/promises") {
  const req = eval("require") as NodeRequire;
  return req("node:fs/promises") as typeof import("node:fs/promises");
}
function nodePath(): typeof import("node:path") {
  const req = eval("require") as NodeRequire;
  return req("node:path") as typeof import("node:path");
}

const FORGE_API = "https://three.ws/api/forge";
const DOWNLOAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const POLL_TRIES = 90;
const POLL_DELAY_MS = 10_000;
const MAX_GLB_BYTES = 40 * 1024 * 1024;

/** Where forged models live — beside the SQLite file so they survive deploys. */
export function modelsDir(): string {
  const path = nodePath();
  const dbPath = process.env.BOWYER_DB_PATH ?? path.join(process.cwd(), "data", "bowyer.db");
  return path.join(path.dirname(dbPath), "models");
}

export function forgedModelPath(slug: string): string {
  return nodePath().join(modelsDir(), `${slug}.glb`);
}

/** Character prompt in the same style that produced Atlas/Nyx/Vega. */
export function buildCharacterPrompt(input: {
  name: string;
  tagline: string;
  category: string;
}): string {
  const palettes = [
    "brushed titanium body with amber glowing accents and visor",
    "deep navy composite armor with ice-blue glowing circuit lines",
    "matte graphite shell with emerald green glowing seams and visor",
    "off-white ceramic plating with coral orange glowing accents",
    "dark bronze alloy frame with teal glowing core and visor",
    "slate grey angular armor with crimson glowing trim",
  ];
  // Deterministic palette per name so relaunches look consistent.
  let hash = 0;
  for (const ch of input.name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const palette = palettes[hash % palettes.length];

  const domain = `${input.category} specialist robot themed around: ${input.tagline.slice(0, 90)}`;
  return (
    `${domain}, ${palette}, subtle emblem on chest, ` +
    "full body humanoid character standing upright, clean game-ready style"
  );
}

interface ForgeResponse {
  status?: string;
  job_id?: string;
  job?: string;
  [key: string]: unknown;
}

async function postForge(url: string, payload: Record<string, unknown>): Promise<ForgeResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Forge API ${res.status}`);
  return (await res.json()) as ForgeResponse;
}

async function pollForge(job: string): Promise<ForgeResponse> {
  for (let i = 0; i < POLL_TRIES; i++) {
    const res = await fetch(`${FORGE_API}?job=${encodeURIComponent(job)}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const data = (await res.json()) as ForgeResponse;
      const status = data.status ?? "?";
      if (status === "done") return data;
      if (status === "failed" || status === "error") {
        throw new Error(`Forge job ${status}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }
  throw new Error("Forge job timed out");
}

function findGlbUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return value.startsWith("http") && value.includes(".glb") ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGlbUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findGlbUrl(item);
      if (found) return found;
    }
  }
  return null;
}

async function runForgeStep(url: string, payload: Record<string, unknown>): Promise<string> {
  const submitted = await postForge(url, payload);
  const done =
    submitted.status === "done"
      ? submitted // cached result — no job to poll
      : await pollForge(String(submitted.job_id ?? submitted.job ?? ""));
  const glbUrl = findGlbUrl(done);
  if (!glbUrl) throw new Error("Forge returned no GLB URL");
  return glbUrl;
}

/**
 * Rename mixamorig:* bones to anonymous names. The three.ws viewer applies
 * procedural arm posing to recognizably-named rigs, which breaks on forge
 * output (arms pinned behind the back) — anonymous bones keep the natural
 * rest pose, matching the original catalog robots.
 */
export function anonymizeBones(glb: Buffer): Buffer {
  const magic = glb.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("Not a GLB file");
  const version = glb.readUInt32LE(4);

  const jsonLen = glb.readUInt32LE(12);
  const jsonType = glb.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error("Unexpected GLB chunk layout");

  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8")) as {
    nodes?: { name?: string }[];
  };
  const rest = glb.subarray(20 + jsonLen);

  let renamed = 0;
  (json.nodes ?? []).forEach((node, i) => {
    if (node.name?.startsWith("mixamorig")) {
      node.name = `bone_${i}`;
      renamed++;
    }
  });
  if (renamed === 0) return glb;

  let payload = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (payload.length % 4)) % 4;
  if (pad > 0) payload = Buffer.concat([payload, Buffer.alloc(pad, 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(magic, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(12 + 8 + payload.length + rest.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(payload.length, 0);
  jsonHeader.writeUInt32LE(jsonType, 4);

  return Buffer.concat([header, jsonHeader, payload, rest]);
}

export function setAgentAvatarGlb(slug: string, url: string | null): void {
  db().prepare("UPDATE agents SET avatar_glb = ? WHERE slug = ?").run(url, slug);
}

export function getAgentAvatarGlbFromDb(slug: string): string | null {
  if (typeof window !== "undefined") return null;
  try {
    const row = db()
      .prepare("SELECT avatar_glb FROM agents WHERE slug = ?")
      .get(slug) as { avatar_glb: string | null } | undefined;
    return row?.avatar_glb ?? null;
  } catch {
    return null;
  }
}

/**
 * Full pipeline: generate, rig, anonymize, persist. Takes ~1–3 minutes.
 * Returns the public URL for the model, or null when any step fails —
 * a missing robot must never block a launch.
 */
export async function forgeAgentModel(input: {
  slug: string;
  name: string;
  tagline: string;
  category: string;
}): Promise<string | null> {
  try {
    const prompt = buildCharacterPrompt(input);
    const generatedUrl = await runForgeStep(FORGE_API, { prompt, tier: "standard" });
    const riggedUrl = await runForgeStep(`${FORGE_API}?action=rig`, { glb_url: generatedUrl });

    const res = await fetch(riggedUrl, {
      headers: { "User-Agent": DOWNLOAD_UA },
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`GLB download failed (${res.status})`);
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length < 1000 || raw.length > MAX_GLB_BYTES) {
      throw new Error(`GLB size out of range (${raw.length} bytes)`);
    }

    const cleaned = anonymizeBones(raw);
    const fs = nodeFs();
    await fs.mkdir(modelsDir(), { recursive: true });
    await fs.writeFile(forgedModelPath(input.slug), cleaned);

    const url = `/api/models/${input.slug}`;
    setAgentAvatarGlb(input.slug, url);
    return url;
  } catch (error) {
    console.error(`[forge] ${input.slug}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

function modelFileExists(slug: string): boolean {
  try {
    const req = eval("require") as NodeRequire;
    return (req("node:fs") as typeof import("node:fs")).existsSync(forgedModelPath(slug));
  } catch {
    return false;
  }
}

/**
 * Agents (DB-backed and catalog) whose 3D body is missing: never forged,
 * or forged onto a volume that has since been wiped.
 */
export function missingAvatarSlugs(): string[] {
  const rows = db().prepare("SELECT slug FROM agents").all() as { slug: string }[];
  const dbMissing = rows
    .map((r) => r.slug)
    .filter((slug) => {
      const stored = getAgentAvatarGlbFromDb(slug);
      if (!stored) return true;
      if (stored.startsWith("/api/models/")) return !modelFileExists(slug);
      return false;
    });

  const catalogMissing = agentSummaries
    .map((a) => a.slug)
    .filter((slug) => {
      const mapped = AGENT_AVATAR_GLB[slug];
      if (mapped && !mapped.startsWith("/api/models/")) return false;
      return !modelFileExists(slug);
    });

  return [...new Set([...dbMissing, ...catalogMissing])];
}

/**
 * Forge exactly one missing avatar. Called from the scheduler tick so the
 * fleet self-heals at a pace three.ws's free lane tolerates (one job / 15min).
 */
export async function healOneMissingAvatar(): Promise<string | null> {
  const missing = missingAvatarSlugs();
  if (missing.length === 0) return null;
  const slug = missing[0];

  const catalog = agentSummaries.find((a) => a.slug === slug);
  let name = catalog?.name ?? slug;
  let tagline = catalog?.tagline ?? "autonomous business";
  let category = catalog?.category ?? "research";
  try {
    const row = db().prepare("SELECT summary FROM agents WHERE slug = ?").get(slug) as
      | { summary: string | null }
      | undefined;
    const parsed = JSON.parse(row?.summary ?? "{}") as {
      name?: string;
      tagline?: string;
      category?: string;
    };
    if (parsed.name) name = parsed.name;
    if (parsed.tagline) tagline = parsed.tagline;
    if (parsed.category) category = parsed.category;
  } catch {
    /* catalog/defaults hold */
  }

  const url = await forgeAgentModel({ slug, name, tagline, category });
  console.log(`[forge] heal ${slug}: ${url ? "forged" : "failed"} (${missing.length} missing)`);
  return url ? slug : null;
}
