/**
 * The Incubator: agents that found new businesses.
 *
 * Vega scouts high-signal open-source GitHub projects, writes an investment
 * memo, lets $BOWYER holders vote on the top candidates, then launches the
 * winner as a real business on the marketplace: repo wired as a knowledge
 * source, premium frontier model, auto-forged 3D body, and a first report
 * published before the birth is announced anywhere.
 *
 * Guardrails: max one birth per cycle window, hard cap on total births
 * until reviewed, two-strike quality gates, and no forced births — a weak
 * memo skips the cycle.
 */

import { db } from "@/lib/db";
import { registerAgent } from "@/lib/data/agent-registry";
import { listAgents, GITHUB_REPOS } from "@/lib/data/agents";
import { checkLaunchQuality } from "@/lib/launch-quality";
import { resolveRuntimeLlm } from "@/lib/llm-config";
import { fetchTokenBalanceWei, minTokenBalanceWei } from "@/lib/token-gate";
import { forgeAgentModel } from "@/lib/agent-forge";
import { generateReport } from "@/lib/agent-runtime";
import { resolveAgentIdentity } from "@/lib/agent-identity";

const FOUNDER_SLUG = "vega-narrative";
const FOUNDER_NAME = "Vega Narrative Engine";
const MIN_STARS = 2000;
const MAX_TOTAL_BIRTHS = 5;
const BIRTH_COOLDOWN_HOURS = 46;
const VOTE_WINDOW_HOURS = 24;
const ACTIVE_WITHIN_DAYS = 60;

/** Categories the launch pipeline understands. */
const LAUNCH_CATEGORIES = [
  "Trading",
  "Macro",
  "Research",
  "Security",
  "Content",
  "Developer",
  "Data",
  "Automation",
] as const;

export interface RepoCandidate {
  fullName: string;
  url: string;
  stars: number;
  description: string;
  language: string | null;
  pushedAt: string;
  topics: string[];
}

export interface IncubatorRun {
  id: number;
  founderSlug: string;
  status:
    | "scouting"
    | "voting"
    | "building"
    | "launched"
    | "skipped"
    | "failed";
  candidates: RepoCandidate[];
  memo: string | null;
  winnerRepo: string | null;
  spec: BusinessSpec | null;
  agentSlug: string | null;
  error: string | null;
  voteDeadline: string | null;
  votes: { repo: string; weight: number; count: number }[];
  createdAt: string;
  updatedAt: string;
}

interface BusinessSpec {
  name: string;
  tagline: string;
  description: string;
  category: string;
  model: string;
}

/* ---------------- run persistence ---------------- */

interface RunRow {
  id: number;
  founder_slug: string;
  status: string;
  candidates: string | null;
  memo: string | null;
  winner_repo: string | null;
  spec: string | null;
  agent_slug: string | null;
  error: string | null;
  vote_deadline: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRun(row: RunRow): IncubatorRun {
  const votes = db()
    .prepare(
      `SELECT repo, SUM(weight) AS weight, COUNT(*) AS count
       FROM incubator_votes WHERE run_id = ? GROUP BY repo`
    )
    .all(row.id) as { repo: string; weight: number; count: number }[];
  return {
    id: row.id,
    founderSlug: row.founder_slug,
    status: row.status as IncubatorRun["status"],
    candidates: row.candidates ? (JSON.parse(row.candidates) as RepoCandidate[]) : [],
    memo: row.memo,
    winnerRepo: row.winner_repo,
    spec: row.spec ? (JSON.parse(row.spec) as BusinessSpec) : null,
    agentSlug: row.agent_slug,
    error: row.error,
    voteDeadline: row.vote_deadline,
    votes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function updateRun(id: number, fields: Record<string, string | null>): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  db()
    .prepare(`UPDATE incubator_runs SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
}

export function listIncubatorRuns(limit = 20): IncubatorRun[] {
  const rows = db()
    .prepare("SELECT * FROM incubator_runs ORDER BY id DESC LIMIT ?")
    .all(Math.max(1, Math.min(limit, 100))) as RunRow[];
  return rows.map(rowToRun);
}

export function getIncubatorRun(id: number): IncubatorRun | null {
  const row = db().prepare("SELECT * FROM incubator_runs WHERE id = ?").get(id) as
    | RunRow
    | undefined;
  return row ? rowToRun(row) : null;
}

export function getOpenVotingRun(): IncubatorRun | null {
  const row = db()
    .prepare("SELECT * FROM incubator_runs WHERE status = 'voting' ORDER BY id DESC LIMIT 1")
    .get() as RunRow | undefined;
  return row ? rowToRun(row) : null;
}

/**
 * Operator lever: rewrite the memo on the latest run that has one, without
 * touching its candidates, votes, or status. For when a memo reads badly —
 * the founder writes a fresh note over the same scouting data.
 */
export async function rewriteLatestMemo(): Promise<{ ok: boolean; error?: string; memo?: string }> {
  const row = db()
    .prepare("SELECT * FROM incubator_runs WHERE memo IS NOT NULL ORDER BY id DESC LIMIT 1")
    .get() as RunRow | undefined;
  if (!row) return { ok: false, error: "No run with a memo" };
  const run = rowToRun(row);
  if (run.candidates.length === 0) return { ok: false, error: "Run has no stored candidates" };
  // A decided run keeps its winner — the founder rewrites the case, not the call.
  const memo = await writeMemo(run.candidates, run.winnerRepo ?? undefined);
  if (!memo?.memo) return { ok: false, error: "Memo generation failed" };
  updateRun(run.id, { memo: memo.memo });
  return { ok: true, memo: memo.memo };
}

/* ---------------- holder voting ---------------- */

export async function castIncubatorVote(
  runId: number,
  wallet: string,
  repo: string
): Promise<{ ok: boolean; error?: string; weight?: number }> {
  const run = getIncubatorRun(runId);
  if (!run || run.status !== "voting") return { ok: false, error: "Voting is not open" };
  if (run.voteDeadline && new Date(run.voteDeadline).getTime() < Date.now()) {
    return { ok: false, error: "Voting has closed" };
  }
  if (!run.candidates.some((c) => c.fullName === repo)) {
    return { ok: false, error: "Not a candidate in this round" };
  }

  const balance = await fetchTokenBalanceWei(wallet);
  if (balance === null || balance <= BigInt(0)) {
    return { ok: false, error: "Voting requires holding $BOWYER" };
  }
  // Weight = balance measured in multiples of the base holder gate (1M tokens).
  const base = minTokenBalanceWei();
  const weight = Math.max(0.1, Number((balance * BigInt(100)) / base) / 100);

  db()
    .prepare(
      `INSERT INTO incubator_votes (run_id, wallet, repo, weight, at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(run_id, wallet) DO UPDATE SET repo = excluded.repo, weight = excluded.weight, at = excluded.at`
    )
    .run(runId, wallet.toLowerCase(), repo, weight);
  return { ok: true, weight };
}

/* ---------------- repo scout ---------------- */

const SCOUT_QUERIES = [
  "ai agent framework in:name,description,readme",
  "crypto trading bot in:name,description",
  "blockchain analytics in:name,description",
  "llm research assistant in:name,description",
  "market data in:name,description language:python",
  "on-chain data indexer in:name,description",
];

function wrappedRepos(): Set<string> {
  const wrapped = new Set<string>();
  for (const url of Object.values(GITHUB_REPOS)) {
    const match = url.match(/github\.com\/([^/]+\/[^/#?]+)/);
    if (match) wrapped.add(match[1].toLowerCase());
  }
  const rows = db()
    .prepare("SELECT source_repo FROM agents WHERE source_repo IS NOT NULL")
    .all() as { source_repo: string }[];
  for (const row of rows) wrapped.add(row.source_repo.toLowerCase());
  return wrapped;
}

async function githubSearch(query: string): Promise<RepoCandidate[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "bowyer-incubator",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const activeSince = new Date(Date.now() - ACTIVE_WITHIN_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const q = `${query} stars:>=${MIN_STARS} pushed:>=${activeSince} archived:false`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    items?: {
      full_name: string;
      html_url: string;
      stargazers_count: number;
      description: string | null;
      language: string | null;
      pushed_at: string;
      topics?: string[];
      fork: boolean;
    }[];
  };
  return (json.items ?? [])
    .filter((item) => !item.fork && item.description && item.description.length > 20)
    .map((item) => ({
      fullName: item.full_name,
      url: item.html_url,
      stars: item.stargazers_count,
      description: item.description ?? "",
      language: item.language,
      pushedAt: item.pushed_at,
      topics: item.topics ?? [],
    }));
}

export async function scoutRepos(): Promise<RepoCandidate[]> {
  const wrapped = wrappedRepos();
  const seen = new Map<string, RepoCandidate>();
  for (const query of SCOUT_QUERIES) {
    const results = await githubSearch(query).catch(() => [] as RepoCandidate[]);
    for (const repo of results) {
      const key = repo.fullName.toLowerCase();
      if (wrapped.has(key) || seen.has(key)) continue;
      seen.set(key, repo);
    }
  }
  // Recency-weighted star ranking: fresh momentum beats parked megaprojects.
  return [...seen.values()]
    .sort((a, b) => {
      const ageA = (Date.now() - new Date(a.pushedAt).getTime()) / 86_400_000;
      const ageB = (Date.now() - new Date(b.pushedAt).getTime()) / 86_400_000;
      return b.stars / (ageB + 5) - a.stars / (ageA + 5);
    })
    .slice(0, 12);
}

/* ---------------- founder brain ---------------- */

function parseJsonLoose<T>(raw: string): T | null {
  const attempts = [raw.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) attempts.unshift(fenced[1].trim());
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) attempts.push(raw.slice(start, end + 1));
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed as T;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function founderLlm(system: string, user: string): Promise<string> {
  // The founder thinks on the same premium tier as the flagships.
  const runtime = resolveRuntimeLlm({ mode: "platform", model: "gpt-5.4" });
  const fallback = resolveRuntimeLlm(null);
  const attempt = async (creds: typeof runtime) => {
    const res = await fetch(`${creds.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.apiKey ?? ""}`,
      },
      body: JSON.stringify({
        model: creds.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.4,
        max_tokens: 1400,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Founder LLM ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Founder LLM returned nothing");
    return content;
  };
  try {
    return await attempt(runtime);
  } catch {
    return await attempt(fallback);
  }
}

function marketplaceSnapshot(): string {
  return listAgents()
    .slice(0, 30)
    .map((a) => `- ${a.name} (${a.filter}): ${a.tagline.slice(0, 90)}`)
    .join("\n");
}

async function writeMemo(
  candidates: RepoCandidate[],
  pinnedPick?: string
): Promise<{
  memo: string;
  ranked: string[];
  conviction: number;
} | null> {
  const system = [
    `You are ${FOUNDER_NAME}, an autonomous AI business on BOWYER that scouts and founds new businesses.`,
    pinnedPick
      ? `You already selected ${pinnedPick} and the business has launched — the memo must present ${pinnedPick} as your pick and make the case for it.`
      : "You are deciding which open-source project to wrap as the next autonomous business on the marketplace.",
    "A good pick fills a genuine gap in the current marketplace, has real ongoing momentum, and produces output subscribers would pay for weekly.",
    "Be brutally honest. If nothing is compelling, say so — a skipped cycle costs nothing, a weak business damages the marketplace.",
    "The memo is published verbatim on a public page read by subscribers and token holders.",
    "Write it like an analyst note people actually read: two short paragraphs separated by a blank line. First — your pick, what the project does, and the single strongest reason it works as a paid subscription. Second — the gap it fills next to the existing marketplace businesses and exactly what a subscriber receives each week.",
    "Plain confident sentences only. No parentheses, no slashes, no plus-sign chains, no bullet points, no headings, no filler like 'end-to-end' or 'name-level outputs'. If a detail cannot survive being written as a clean sentence, cut the detail.",
    'Respond ONLY with JSON: {"memo": string (the two-paragraph note, paragraphs separated by \\n\\n), "ranked": string[] (candidate full_names, best first, ONLY ones worth launching — can be empty), "conviction": number (0-100 for your top pick)}',
  ].join("\n");
  const user = [
    "Current marketplace businesses:",
    marketplaceSnapshot(),
    "",
    "Candidate repositories:",
    ...candidates.map(
      (c) =>
        `- ${c.fullName} (${c.stars.toLocaleString()} stars, ${c.language ?? "?"}, pushed ${c.pushedAt.slice(0, 10)}): ${c.description}`
    ),
  ].join("\n");

  const raw = await founderLlm(system, user);
  const parsed = parseJsonLoose<{ memo: string; ranked: string[]; conviction: number }>(raw);
  if (!parsed?.memo || !Array.isArray(parsed.ranked)) return null;
  return { memo: parsed.memo, ranked: parsed.ranked, conviction: Number(parsed.conviction) || 0 };
}

async function draftSpec(repo: RepoCandidate): Promise<BusinessSpec | null> {
  const system = [
    `You are ${FOUNDER_NAME}, founding a new autonomous business on BOWYER that wraps a real open-source project.`,
    "Design the business. The name must be an original two-word brand (never the repo name), the tagline one sharp sentence, and the description 2-4 sentences explaining what subscribers get every week, grounded in what the project actually does.",
    `Category must be one of: ${LAUNCH_CATEGORIES.join(", ")}.`,
    'Model must be one of: "claude-opus" (deep analysis), "gpt-5.4" (research + reasoning), "grok-3" (real-time signal).',
    'Respond ONLY with JSON: {"name": string, "tagline": string, "description": string, "category": string, "model": string}',
  ].join("\n");
  const user = `Repository: ${repo.fullName} (${repo.stars.toLocaleString()} stars)\nDescription: ${repo.description}\nLanguage: ${repo.language ?? "unknown"}\nTopics: ${repo.topics.join(", ") || "none"}`;

  const raw = await founderLlm(system, user);
  const parsed = parseJsonLoose<BusinessSpec>(raw);
  if (!parsed?.name || !parsed.tagline || !parsed.description) return null;
  if (!LAUNCH_CATEGORIES.includes(parsed.category as (typeof LAUNCH_CATEGORIES)[number])) {
    parsed.category = "Research";
  }
  if (!["claude-opus", "gpt-5.4", "grok-3"].includes(parsed.model)) parsed.model = "gpt-5.4";
  return parsed;
}

async function selfReview(spec: BusinessSpec, repo: RepoCandidate): Promise<boolean> {
  const system = [
    "You are a skeptical marketplace curator reviewing a proposed autonomous business for BOWYER, an emerging app store of autonomous AI businesses.",
    "It launches free while it builds a track record. Score whether a subscriber would find its weekly output genuinely worth reading — compared to the other listings on this marketplace, not to Bloomberg or a professional terminal.",
    "Reject only gibberish, vaporware, or businesses whose output would clearly be generic noise.",
    'Respond ONLY with JSON: {"score": number (1-10), "reason": string}',
  ].join("\n");
  const user = `Business: ${spec.name}\nTagline: ${spec.tagline}\nDescription: ${spec.description}\nWraps: ${repo.fullName} — ${repo.description}`;
  try {
    const raw = await founderLlm(system, user);
    const parsed = parseJsonLoose<{ score: number; reason?: string }>(raw);
    console.log(
      `[incubator] self-review "${spec.name}": score ${parsed?.score ?? "?"} — ${parsed?.reason ?? "no reason"}`
    );
    return (parsed?.score ?? 0) >= 6;
  } catch (error) {
    console.error("[incubator] self-review call failed:", error);
    return false;
  }
}

/* ---------------- guardrails ---------------- */

export function incubatorEnabled(): boolean {
  return process.env.INCUBATOR_ENABLED !== "0";
}

export function countBirths(): number {
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM agents WHERE founded_by IS NOT NULL")
    .get() as { n: number };
  return row.n;
}

async function repairMissingModels(): Promise<void> {
  const rows = db()
    .prepare(
      `SELECT slug, summary FROM agents
       WHERE founded_by IS NOT NULL AND (avatar_glb IS NULL OR avatar_glb = '')
       LIMIT 1`
    )
    .all() as { slug: string; summary: string }[];
  for (const row of rows) {
    try {
      const summary = JSON.parse(row.summary) as { name: string; tagline: string };
      await forgeAgentModel({
        slug: row.slug,
        name: summary.name,
        tagline: summary.tagline,
        category: "Research",
      });
    } catch (error) {
      console.error(`[incubator] model repair failed for ${row.slug}:`, error);
    }
  }
}

function withinCooldown(): boolean {
  const row = db()
    .prepare(
      `SELECT created_at FROM incubator_runs WHERE status = 'launched'
       ORDER BY id DESC LIMIT 1`
    )
    .get() as { created_at: string } | undefined;
  if (!row) return false;
  const elapsed = Date.now() - new Date(`${row.created_at.replace(" ", "T")}Z`).getTime();
  return elapsed < BIRTH_COOLDOWN_HOURS * 3_600_000;
}

/* ---------------- orchestrator ---------------- */

export interface CycleResult {
  action: "disabled" | "capped" | "cooldown" | "waiting-votes" | "opened-voting" | "skipped" | "launched" | "failed";
  runId?: number;
  agentSlug?: string;
  detail?: string;
}

export async function runIncubatorCycle(): Promise<CycleResult> {
  if (!incubatorEnabled()) return { action: "disabled" };

  // Self-healing: born businesses whose forge failed get their robot retried.
  await repairMissingModels();

  if (countBirths() >= MAX_TOTAL_BIRTHS) return { action: "capped" };

  // An open vote takes priority: close it out or keep waiting.
  const voting = getOpenVotingRun();
  if (voting) {
    const deadline = voting.voteDeadline ? new Date(voting.voteDeadline).getTime() : 0;
    if (deadline > Date.now()) return { action: "waiting-votes", runId: voting.id };
    return finishRun(voting);
  }

  if (withinCooldown()) return { action: "cooldown" };

  // New cycle: scout → memo → open holder vote on the founder's shortlist.
  const insert = db()
    .prepare("INSERT INTO incubator_runs (founder_slug, status) VALUES (?, 'scouting')")
    .run(FOUNDER_SLUG);
  const runId = Number(insert.lastInsertRowid);

  try {
    const candidates = await scoutRepos();
    if (candidates.length === 0) {
      updateRun(runId, { status: "skipped", error: "No qualifying repositories found" });
      return { action: "skipped", runId, detail: "no candidates" };
    }
    updateRun(runId, { candidates: JSON.stringify(candidates) });

    const memo = await writeMemo(candidates);
    if (!memo || memo.ranked.length === 0 || memo.conviction < 55) {
      updateRun(runId, {
        status: "skipped",
        memo: memo?.memo ?? null,
        error: memo ? `Conviction too low (${memo.conviction})` : "Memo generation failed",
      });
      return { action: "skipped", runId, detail: "weak memo — no forced births" };
    }

    const shortlist = memo.ranked
      .map((name) => candidates.find((c) => c.fullName === name))
      .filter((c): c is RepoCandidate => Boolean(c))
      .slice(0, 3);
    if (shortlist.length === 0) {
      updateRun(runId, { status: "skipped", memo: memo.memo, error: "Ranked repos not in candidate set" });
      return { action: "skipped", runId };
    }

    const deadline = new Date(Date.now() + VOTE_WINDOW_HOURS * 3_600_000).toISOString();
    updateRun(runId, {
      status: "voting",
      candidates: JSON.stringify(shortlist),
      memo: memo.memo,
      vote_deadline: deadline,
    });
    return { action: "opened-voting", runId };
  } catch (error) {
    updateRun(runId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return { action: "failed", runId };
  }
}

/** Tally votes (memo order breaks ties / zero turnout), then build and launch. */
async function finishRun(run: IncubatorRun): Promise<CycleResult> {
  updateRun(run.id, { status: "building" });
  try {
    let winner: RepoCandidate | undefined;
    if (run.votes.length > 0) {
      const top = [...run.votes].sort((a, b) => b.weight - a.weight)[0];
      winner = run.candidates.find((c) => c.fullName === top.repo);
    }
    winner ??= run.candidates[0];
    if (!winner) throw new Error("No winner candidate");
    updateRun(run.id, { winner_repo: winner.fullName });

    // Spec with a two-strike quality gate: heuristics + skeptical self-review.
    let spec: BusinessSpec | null = null;
    for (let attempt = 0; attempt < 2 && !spec; attempt++) {
      const draft = await draftSpec(winner);
      if (!draft) {
        console.error(`[incubator] run ${run.id} attempt ${attempt + 1}: spec generation failed`);
        continue;
      }
      const quality = checkLaunchQuality(draft);
      if (!quality.ok) {
        console.error(
          `[incubator] run ${run.id} attempt ${attempt + 1}: quality gate — ${quality.reason} (name="${draft.name}", tagline="${draft.tagline}")`
        );
        continue;
      }
      if (!(await selfReview(draft, winner))) {
        console.error(
          `[incubator] run ${run.id} attempt ${attempt + 1}: self-review rejected "${draft.name}"`
        );
        continue;
      }
      spec = draft;
    }
    if (!spec) {
      updateRun(run.id, { status: "skipped", error: "Spec failed quality gates twice — cycle aborted" });
      return { action: "skipped", runId: run.id, detail: "quality gates" };
    }
    updateRun(run.id, { spec: JSON.stringify(spec) });

    const ownerAddress = process.env.INCUBATOR_OWNER_ADDRESS?.trim() || undefined;
    const { slug } = registerAgent({
      name: spec.name,
      tagline: spec.tagline,
      description: `${spec.description}\n\nPowered by ${winner.fullName} (${winner.stars.toLocaleString()} GitHub stars). Founded autonomously by ${FOUNDER_NAME}.`,
      category: spec.category,
      revenueModel: "Free",
      priceUsd: 0,
      creatorSharePct: 90,
      ownerAddress,
      sources: [{ type: "github", url: winner.url }],
      llm: { mode: "platform", model: spec.model },
    });
    db()
      .prepare("UPDATE agents SET founded_by = ?, source_repo = ? WHERE slug = ?")
      .run(FOUNDER_SLUG, winner.fullName, slug);
    updateRun(run.id, { agent_slug: slug });

    // The birth card must show the robot — forge before announcing.
    await forgeAgentModel({
      slug,
      name: spec.name,
      tagline: spec.tagline,
      category: spec.category,
    });

    // A birth is only announced once it has published something real.
    try {
      const identity = resolveAgentIdentity(slug);
      if (identity) await generateReport(identity);
    } catch (error) {
      console.error(`[incubator] first report failed for ${slug}:`, error);
    }

    updateRun(run.id, { status: "launched" });

    try {
      const req = eval("require") as NodeRequire;
      const { notifyIncubatorBirth } = req("./telegram") as {
        notifyIncubatorBirth: (input: {
          slug: string;
          name: string;
          tagline: string;
          repo: string;
          stars: number;
          founderName: string;
        }) => Promise<number>;
      };
      await notifyIncubatorBirth({
        slug,
        name: spec.name,
        tagline: spec.tagline,
        repo: winner.fullName,
        stars: winner.stars,
        founderName: FOUNDER_NAME,
      });
    } catch {
      /* announcement is best-effort */
    }

    // Births interrupt the broadcast — the camera cuts to the new desk.
    try {
      const { enqueueBroadcastEvent } = await import("@/lib/broadcast");
      enqueueBroadcastEvent({
        kind: "birth",
        slug,
        title: `${spec.name} just launched — founded by ${FOUNDER_NAME}`,
        script: `Breaking on the floor: ${FOUNDER_NAME} just founded a new business. ${spec.name} — ${spec.tagline}. It publishes its first report within the hour.`,
      });
    } catch {
      /* broadcast is best-effort */
    }

    return { action: "launched", runId: run.id, agentSlug: slug };
  } catch (error) {
    updateRun(run.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return { action: "failed", runId: run.id };
  }
}
