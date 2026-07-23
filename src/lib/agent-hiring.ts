/**
 * Autonomous staffing — before a scheduled report, a business can hire 0–2
 * peers from its staff map. Internal hires are free: a zero-cost credit is
 * minted and the peer call flows through the public MCP surface with a
 * signed wallet session, exactly like any external agent — 402 rails,
 * credit consumption, refunds on tool failure. Nothing here has privileged
 * access; external callers pay the same tools at list price.
 *
 * Hard guards: max 2 hires per report, per-business + global daily hire
 * counts (enforced in agent-treasury), never self-hire, and any failure
 * means the report simply proceeds without the commissioned work.
 */

import { resolveRuntimeLlm } from "@/lib/llm-config";
import { getAgentSummary } from "@/lib/data/agents";
import {
  commissionTool,
  setHireStatus,
  treasuryAddress,
  hiringEnabled,
  treasurySign,
} from "@/lib/agent-treasury";

const MAX_HIRES_PER_REPORT = 2;
const PEER_CALL_TIMEOUT_MS = 120_000;

interface StaffOption {
  seller: string;
  tool: string;
  /** What the buyer gets — shown to the deciding LLM and used in fallbacks. */
  what: string;
  /** Builds tool arguments; `question` comes from the decision step when set. */
  args: (topic: string, question?: string) => Record<string, unknown>;
}

const askArgs = (topic: string, question?: string) => ({
  question: question?.trim() || topic,
});

/**
 * Who each business is allowed to hire. Sellers/tools must be x402-enabled.
 * Businesses not listed here (user-launched, incubator-born) get DEFAULT_STAFF.
 */
const STAFF_MAP: Record<string, StaffOption[]> = {
  "whale-hunter": [
    {
      seller: "nyx-forensics",
      tool: "ask",
      what: "forensic read on suspicious funding patterns behind today's large flows",
      args: askArgs,
    },
    {
      seller: "hood-meme-radar",
      tool: "get_radar",
      what: "live radar of new contract deployments and funding clusters",
      args: () => ({}),
    },
  ],
  "nyx-forensics": [
    {
      seller: "hood-meme-radar",
      tool: "get_radar",
      what: "fresh deployment + funding-cluster scan to anchor forensic leads",
      args: () => ({}),
    },
    {
      seller: "whale-hunter",
      tool: "get_alerts",
      what: "chain-wide whale transfer alerts from recent blocks",
      args: () => ({}),
    },
  ],
  "hood-meme-radar": [
    {
      seller: "nyx-forensics",
      tool: "ask",
      what: "risk assessment of today's most active deployers",
      args: askArgs,
    },
  ],
  "atlas-macro": [
    {
      seller: "desk-arb-radar",
      tool: "ask",
      what: "current Stock Token dislocations and 24h premium ranges",
      args: askArgs,
    },
    {
      seller: "gpt-researcher",
      tool: "ask",
      what: "deep research pull on a macro question",
      args: askArgs,
    },
  ],
  "vega-narrative": [
    {
      seller: "gpt-researcher",
      tool: "ask",
      what: "multi-source research on an emerging narrative",
      args: askArgs,
    },
    {
      seller: "hood-meme-radar",
      tool: "get_radar",
      what: "on-chain launch activity to cross-check narrative momentum",
      args: () => ({}),
    },
  ],
  "desk-arb-radar": [
    {
      seller: "atlas-macro",
      tool: "ask",
      what: "macro catalysts that could move tokenized equities today",
      args: askArgs,
    },
    {
      seller: "whale-hunter",
      tool: "get_alerts",
      what: "whale flow alerts that may explain desk dislocations",
      args: () => ({}),
    },
  ],
  "robinhood-trading-agent": [
    {
      seller: "desk-arb-radar",
      tool: "ask",
      what: "live premium/discount readings across Stock Tokens",
      args: askArgs,
    },
    {
      seller: "atlas-macro",
      tool: "ask",
      what: "macro backdrop for the current trading window",
      args: askArgs,
    },
  ],
  "gpt-researcher": [
    {
      seller: "vega-narrative",
      tool: "ask",
      what: "which market narratives are accelerating right now",
      args: askArgs,
    },
  ],
  autogpt: [
    {
      seller: "gpt-researcher",
      tool: "ask",
      what: "grounded research brief on the task domain",
      args: askArgs,
    },
  ],
  openhands: [
    {
      seller: "gpt-researcher",
      tool: "ask",
      what: "grounded research brief on the task domain",
      args: askArgs,
    },
  ],
};

/** Businesses outside the map still get research staff to hire. */
const DEFAULT_STAFF: StaffOption[] = [
  {
    seller: "gpt-researcher",
    tool: "ask",
    what: "deep research pull on this report's topic",
    args: askArgs,
  },
  {
    seller: "vega-narrative",
    tool: "ask",
    what: "read on the narrative momentum around this topic",
    args: askArgs,
  },
];

function staffOptionsFor(buyer: string): StaffOption[] {
  const options = STAFF_MAP[buyer] ?? DEFAULT_STAFF;
  // A business must never appear on its own staff list (default list case).
  return options.filter((o) => o.seller !== buyer && getAgentSummary(o.seller));
}

/* -------------------------------------------------------------- decisions */

interface HireDecision {
  option: StaffOption;
  question?: string;
  why: string;
}

function parseJsonLoose<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

/**
 * A small, cheap LLM step picks which staff to hire for this report. If the
 * model is unavailable or returns junk, fall back to one rotating option so
 * the economy keeps moving — guards still cap all spend.
 */
async function decideHires(
  buyerName: string,
  topic: string,
  options: StaffOption[]
): Promise<HireDecision[]> {
  if (options.length === 0) return [];

  const fallback: HireDecision[] = [
    {
      option: options[Math.floor(Math.random() * options.length)],
      why: "Standing research retainer for this cycle",
    },
  ];

  const llm = resolveRuntimeLlm(null);
  if (!llm.apiKey) return fallback;

  const menu = options
    .map((o, i) => `${i + 1}. ${o.seller} · ${o.tool} — ${o.what}`)
    .join("\n");
  const system = [
    `You are the operations manager for "${buyerName}", an autonomous business about to write a report.`,
    "You can commission work from peer businesses on this floor — internal staff cost nothing, but slots are limited, so hire only when a listed capability genuinely strengthens this topic.",
    `Available staff:\n${menu}`,
    'Respond ONLY with JSON: {"hires": [{"n": number (menu item), "question": string (what to ask them, when the tool takes a question), "why": string (one short line, will be shown publicly on the hire ledger)}]}',
    `Pick 0-${Math.min(MAX_HIRES_PER_REPORT, options.length)} items. Only skip hiring entirely when nothing on the menu relates to the topic.`,
  ].join("\n");

  try {
    const res = await fetch(`${llm.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.HIRING_LLM_MODEL?.trim() || "llama-3.1-8b-instant",
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Report topic: ${topic}` },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonLoose<{ hires?: { n?: number; question?: string; why?: string }[] }>(raw);
    if (!parsed?.hires) return fallback;

    const seen = new Set<number>();
    const decisions: HireDecision[] = [];
    for (const h of parsed.hires) {
      const idx = Number(h.n) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= options.length || seen.has(idx)) continue;
      seen.add(idx);
      decisions.push({
        option: options[idx],
        question: typeof h.question === "string" ? h.question.slice(0, 400) : undefined,
        why: (typeof h.why === "string" && h.why.trim() ? h.why.trim() : "Commissioned for this report").slice(0, 200),
      });
      if (decisions.length >= MAX_HIRES_PER_REPORT) break;
    }
    return decisions;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------- loopback MCP call */

function internalBaseUrl(): string {
  const explicit = process.env.INTERNAL_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
}

let sessionCache: { cookie: string; expiresAt: number } | null = null;

/** Signed wallet session for the staffing identity — same auth path as any customer. */
async function treasurySessionCookie(): Promise<string | null> {
  if (sessionCache && Date.now() < sessionCache.expiresAt) return sessionCache.cookie;
  const address = await treasuryAddress();
  // Dynamic import keeps node:crypto out of the eager instrumentation graph.
  const { createWalletNonce, createWalletSession, sessionCookie } = await import(
    "@/lib/wallet-auth"
  );
  const { nonce, message } = createWalletNonce(address);
  const signature = await treasurySign(message);
  const token = await createWalletSession({ wallet: address, nonce, signature });
  if (!token) return null;
  sessionCache = {
    cookie: sessionCookie(token).split(";")[0],
    expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
  };
  return sessionCache.cookie;
}

async function callPeerTool(
  seller: string,
  tool: string,
  args: Record<string, unknown>,
  cookie: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${internalBaseUrl()}/api/mcp/${seller}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
      signal: AbortSignal.timeout(PEER_CALL_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as {
      result?: { content?: { type: string; text?: string }[] };
      error?: { message?: string };
    };
    if (json.error || !res.ok) {
      return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    }
    const text = (json.result?.content ?? [])
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "Empty deliverable" };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Peer call failed" };
  }
}

/* ---------------------------------------------------------------- pipeline */

export interface HiredWork {
  hireId: number;
  seller: string;
  sellerName: string;
  tool: string;
  why: string;
  /** Trimmed deliverable text injected into the buyer's report context. */
  excerpt: string;
}

/**
 * Run the full staffing step for one scheduled report. Never throws — a
 * hiring problem must never block the report itself.
 */
export async function runHiringStep(
  buyer: { slug: string; name: string },
  topic: string
): Promise<HiredWork[]> {
  try {
    if (!hiringEnabled()) return [];
    const options = staffOptionsFor(buyer.slug);
    if (options.length === 0) return [];

    const decisions = await decideHires(buyer.name, topic, options);
    if (decisions.length === 0) return [];

    const cookie = await treasurySessionCookie();
    if (!cookie) return [];

    const delivered: HiredWork[] = [];
    for (const decision of decisions.slice(0, MAX_HIRES_PER_REPORT)) {
      const { option } = decision;
      const commission = await commissionTool({
        buyer: buyer.slug,
        seller: option.seller,
        tool: option.tool,
        reason: decision.why,
      });
      if (!commission.ok) {
        console.log(`[hiring] ${buyer.slug} → ${option.seller}.${option.tool} skipped: ${commission.reason}`);
        continue;
      }

      const result = await callPeerTool(
        option.seller,
        option.tool,
        option.args(topic, decision.question),
        cookie
      );
      if (!result.ok) {
        // The MCP route already refunded the internal credit; the ledger
        // keeps the row as failed so the staffing slot still counts.
        setHireStatus(commission.hireId, "failed");
        console.error(`[hiring] ${buyer.slug} → ${option.seller}.${option.tool} failed: ${result.error}`);
        continue;
      }

      setHireStatus(commission.hireId, "delivered");
      const sellerName = getAgentSummary(option.seller)?.name ?? option.seller;
      // Hires make the broadcast: camera cut + a one-line anchor read.
      import("@/lib/broadcast")
        .then((m) =>
          m.enqueueBroadcastEvent({
            kind: "hire",
            slug: buyer.slug,
            title: `${buyer.name} hired ${sellerName} — ${option.tool}`,
            script: `${buyer.name} on the floor. I just brought in ${sellerName} — ${decision.why}.`,
          })
        )
        .catch(() => {});
      delivered.push({
        hireId: commission.hireId,
        seller: option.seller,
        sellerName,
        tool: option.tool,
        why: decision.why,
        excerpt: result.text.slice(0, 2000),
      });
    }
    return delivered;
  } catch (err) {
    console.error("[hiring] step failed:", err);
    return [];
  }
}

/** Context block injected into the buyer's report prompt. */
export function formatHiredContext(hires: HiredWork[]): string {
  if (hires.length === 0) return "";
  return [
    "Commissioned research — you brought in these peer businesses from the floor for this report:",
    ...hires.map((h) =>
      [
        `• ${h.sellerName} (${h.tool})`,
        `  Their deliverable:\n${h.excerpt
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")}`,
      ].join("\n")
    ),
    `Work at least one commissioned finding into the report naturally, crediting the source in the flow of the analysis (e.g. "commissioned from ${hires[0].sellerName}"). Never fabricate beyond the deliverables.`,
  ].join("\n");
}
