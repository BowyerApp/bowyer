/**
 * Internal staffing — businesses hire each other's tools for free.
 *
 * A hire mints a zero-cost internal x402 credit for (seller, tool) and the
 * peer call then flows through the exact same MCP surface external agents
 * use — 402 rails, credit consumption, refunds on failure. External callers
 * still pay list price in USDG; only BOWYER businesses staff each other at
 * no charge.
 *
 * Guards: per-business daily hire counts (agent_budgets, seeded below), a
 * global daily count (HIRING_GLOBAL_DAILY_CAP, default 60/day), max hires
 * per report enforced by the hiring step, and never self-hire.
 * Kill switch: HIRING_DISABLED=1, or zero a cap via the admin endpoint.
 *
 * The "treasury" wallet survives only as a signing identity for the
 * loopback wallet session (it holds nothing and never transacts).
 */

import { db } from "@/lib/db";
import { getAgentSummary } from "@/lib/data/agents";
import { isX402Tool } from "@/lib/x402";

const isServer = typeof window === "undefined";

/** Flagships publish most often and get the deeper staffing allowance. */
const FLAGSHIP_DAILY_HIRES = 6;
const DEFAULT_DAILY_HIRES = 3;
const FLAGSHIPS = new Set([
  "whale-hunter",
  "hood-meme-radar",
  "nyx-forensics",
  "atlas-macro",
  "vega-narrative",
  "desk-arb-radar",
  "robinhood-trading-agent",
  "gpt-researcher",
]);

export type HireStatus = "paid" | "delivered" | "failed";

export interface AgentHire {
  id: number;
  buyer: string;
  seller: string;
  tool: string;
  amountUsdg: number;
  txHash: string;
  reason: string | null;
  status: HireStatus;
  reportId: number | null;
  at: string;
}

interface HireRow {
  id: number;
  buyer: string;
  seller: string;
  tool: string;
  amount_usdg: number;
  tx_hash: string;
  reason: string | null;
  status: string;
  report_id: number | null;
  at: string;
}

let tablesReady = false;

function ensureTreasuryTables(): void {
  if (tablesReady) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS agent_budgets (
      slug TEXT PRIMARY KEY,
      daily_cap_usdg REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_hires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer TEXT NOT NULL,
      seller TEXT NOT NULL,
      tool TEXT NOT NULL,
      amount_usdg REAL NOT NULL,
      tx_hash TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'paid',
      report_id INTEGER,
      at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_hires_at ON agent_hires (at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_hires_buyer ON agent_hires (buyer, at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_hires_report ON agent_hires (report_id);
  `);
  tablesReady = true;
}

function rowToHire(row: HireRow): AgentHire {
  return {
    id: row.id,
    buyer: row.buyer,
    seller: row.seller,
    tool: row.tool,
    amountUsdg: row.amount_usdg,
    txHash: row.tx_hash,
    reason: row.reason,
    status: row.status as HireStatus,
    reportId: row.report_id,
    at: row.at,
  };
}

/* --------------------------------------------------------------- identity */

/**
 * Hardhat dev key #0 — publicly known and holds nothing. It only signs the
 * loopback wallet-session challenge so internal calls authenticate like any
 * customer. TREASURY_PRIVATE_KEY (if set) overrides the identity; neither
 * wallet ever sends a transaction.
 */
const INTERNAL_SIGNING_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

function signingKey(): `0x${string}` {
  const raw = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (raw) {
    const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
    if (/^0x[0-9a-fA-F]{64}$/.test(hex)) return hex as `0x${string}`;
  }
  return INTERNAL_SIGNING_KEY;
}

/** Kill switch: HIRING_DISABLED=1 stops all internal staffing. */
export function hiringEnabled(): boolean {
  return process.env.HIRING_DISABLED !== "1";
}

let cachedAddress: string | undefined;

/** The staffing identity's public address (never holds funds). */
export async function treasuryAddress(): Promise<string> {
  if (cachedAddress !== undefined) return cachedAddress;
  const { privateKeyToAccount } = await import("viem/accounts");
  cachedAddress = privateKeyToAccount(signingKey()).address.toLowerCase();
  return cachedAddress;
}

/** Sign a message as the staffing identity (loopback wallet session). */
export async function treasurySign(message: string): Promise<`0x${string}`> {
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeyToAccount(signingKey()).signMessage({ message });
}

/* -------------------------------------------------------------- hire caps */

/** Daily hire allowance for one business (count, not dollars — hires are free). */
export function dailyHireCap(slug: string): number {
  if (!isServer) return 0;
  ensureTreasuryTables();
  const row = db()
    .prepare("SELECT daily_cap_usdg FROM agent_budgets WHERE slug = ?")
    .get(slug) as { daily_cap_usdg: number } | undefined;
  if (row) return Math.max(0, Math.round(row.daily_cap_usdg));
  return FLAGSHIPS.has(slug) ? FLAGSHIP_DAILY_HIRES : DEFAULT_DAILY_HIRES;
}

/** Admin control — setting 0 pauses hiring for that business (kill switch). */
export function setDailyHireCap(slug: string, cap: number): void {
  ensureTreasuryTables();
  db()
    .prepare(
      `INSERT INTO agent_budgets (slug, daily_cap_usdg, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT (slug) DO UPDATE SET daily_cap_usdg = excluded.daily_cap_usdg,
                                        updated_at = datetime('now')`
    )
    .run(slug, Math.max(0, Math.round(cap)));
}

function globalDailyHireCap(): number {
  const raw = Number(process.env.HIRING_GLOBAL_DAILY_CAP ?? 60);
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 60;
}

function isoDayAgo(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Rolling-24h hire count for one buyer. Every ledger row counts — failed
 * deliveries still consumed a staffing slot, which keeps retry loops tame.
 */
export function hiresTodayBy(buyer: string): number {
  ensureTreasuryTables();
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM agent_hires WHERE buyer = ? AND at >= ?")
    .get(buyer, isoDayAgo()) as { n: number };
  return row.n;
}

export function hiresTodayGlobal(): number {
  ensureTreasuryTables();
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM agent_hires WHERE at >= ?")
    .get(isoDayAgo()) as { n: number };
  return row.n;
}

/* --------------------------------------------------------- commissionTool */

/** Mint the zero-cost internal x402 credit that lets the peer call through. */
function mintInternalCredit(seller: string, tool: string, payer: string): void {
  const txHash = `0xint${Array.from({ length: 60 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;
  db()
    .prepare(
      `INSERT INTO x402_payments (slug, tool, payer, tx_hash, amount_usdg, at, consumed)
       VALUES (?, ?, ?, ?, 0, ?, 0)`
    )
    .run(seller, tool, payer, txHash, new Date().toISOString());
}

export type CommissionResult =
  | { ok: true; hireId: number; payer: string }
  | { ok: false; reason: string };

/**
 * Commission a peer business for one free tool call. On success the staffing
 * identity holds an unconsumed zero-cost x402 credit for (seller, tool) which
 * the follow-up MCP call consumes — or gets refunded if the tool errors,
 * exactly like any customer's credit.
 */
export async function commissionTool(input: {
  buyer: string;
  seller: string;
  tool: string;
  reason: string;
}): Promise<CommissionResult> {
  if (!isServer) return { ok: false, reason: "Server only" };
  ensureTreasuryTables();

  const { buyer, seller, tool, reason } = input;
  if (!hiringEnabled()) return { ok: false, reason: "Hiring is disabled" };
  if (buyer === seller) return { ok: false, reason: "A business cannot hire itself" };
  if (!getAgentSummary(seller)) return { ok: false, reason: `Unknown seller: ${seller}` };
  if (!isX402Tool(tool)) return { ok: false, reason: `Tool ${tool} is not hireable` };

  const cap = dailyHireCap(buyer);
  if (hiresTodayBy(buyer) >= cap) {
    return { ok: false, reason: `Daily staffing allowance reached for ${buyer} (${cap}/day)` };
  }
  if (hiresTodayGlobal() >= globalDailyHireCap()) {
    return { ok: false, reason: "Global daily hire cap reached" };
  }

  const payer = await treasuryAddress();
  mintInternalCredit(seller, tool, payer);
  const hireId = insertHire({ buyer, seller, tool, reason, status: "paid" });
  return { ok: true, hireId, payer };
}

function insertHire(input: {
  buyer: string;
  seller: string;
  tool: string;
  reason: string;
  status: HireStatus;
}): number {
  const result = db()
    .prepare(
      `INSERT INTO agent_hires (buyer, seller, tool, amount_usdg, tx_hash, reason, status, at)
       VALUES (?, ?, ?, 0, 'internal', ?, ?, ?)`
    )
    .run(input.buyer, input.seller, input.tool, input.reason, input.status, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

/* ------------------------------------------------------------------ ledger */

export function setHireStatus(hireId: number, status: HireStatus): void {
  ensureTreasuryTables();
  db().prepare("UPDATE agent_hires SET status = ? WHERE id = ?").run(status, hireId);
}

/** Link delivered hires to the report they were commissioned for. */
export function attachHiresToReport(hireIds: number[], reportId: number): void {
  if (hireIds.length === 0) return;
  ensureTreasuryTables();
  const stmt = db().prepare("UPDATE agent_hires SET report_id = ? WHERE id = ?");
  for (const id of hireIds) stmt.run(reportId, id);
}

export function listHires(limit = 40): AgentHire[] {
  if (!isServer) return [];
  ensureTreasuryTables();
  const rows = db()
    .prepare("SELECT * FROM agent_hires ORDER BY id DESC LIMIT ?")
    .all(Math.min(Math.max(limit, 1), 200)) as HireRow[];
  return rows.map(rowToHire);
}

export function listHiresForReport(reportId: number): AgentHire[] {
  if (!isServer) return [];
  ensureTreasuryTables();
  const rows = db()
    .prepare("SELECT * FROM agent_hires WHERE report_id = ? AND status = 'delivered' ORDER BY id ASC")
    .all(reportId) as HireRow[];
  return rows.map(rowToHire);
}

export interface EconomyEdge {
  buyer: string;
  seller: string;
  hires: number;
  lastAt: string;
}

/** Aggregated buyer→seller flows for the staffing graph. */
export function economyEdges(hours = 24 * 7): EconomyEdge[] {
  if (!isServer) return [];
  ensureTreasuryTables();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return db()
    .prepare(
      `SELECT buyer, seller, COUNT(*) AS hires, MAX(at) AS lastAt
       FROM agent_hires
       WHERE at >= ? AND status != 'failed'
       GROUP BY buyer, seller
       ORDER BY hires DESC`
    )
    .all(since) as EconomyEdge[];
}

export interface EconomyStats {
  totalHires: number;
  hires24h: number;
  topEmployee: { slug: string; hires: number } | null;
  topSpender: { slug: string; hires: number } | null;
}

export function economyStats(): EconomyStats {
  if (!isServer) {
    return { totalHires: 0, hires24h: 0, topEmployee: null, topSpender: null };
  }
  ensureTreasuryTables();
  const d = db();
  const all = d
    .prepare("SELECT COUNT(*) AS n FROM agent_hires WHERE status != 'failed'")
    .get() as { n: number };
  const day = d
    .prepare("SELECT COUNT(*) AS n FROM agent_hires WHERE status != 'failed' AND at >= ?")
    .get(isoDayAgo()) as { n: number };
  const employee = d
    .prepare(
      `SELECT seller AS slug, COUNT(*) AS hires FROM agent_hires
       WHERE status != 'failed' GROUP BY seller ORDER BY hires DESC LIMIT 1`
    )
    .get() as { slug: string; hires: number } | undefined;
  const spender = d
    .prepare(
      `SELECT buyer AS slug, COUNT(*) AS hires FROM agent_hires
       WHERE status != 'failed' GROUP BY buyer ORDER BY hires DESC LIMIT 1`
    )
    .get() as { slug: string; hires: number } | undefined;

  return {
    totalHires: all.n,
    hires24h: day.n,
    topEmployee: employee ?? null,
    topSpender: spender ?? null,
  };
}
