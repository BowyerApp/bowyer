/**
 * x402-style pay-per-call for BOWYER MCP tools.
 *
 * Agents (or wallets) pay the business payout address in USDG for a single
 * tool invocation. Flow:
 *  1. MCP returns HTTP 402 with payment requirements when no sub / credit.
 *  2. Client transfers USDG on Robinhood Chain.
 *  3. Client POSTs /api/x402 with txHash (or retries MCP with X-PAYMENT-TX header).
 *  4. Server verifies ERC-20 Transfer and marks one credit consumed on success.
 */

import { db } from "@/lib/db";
import { getPayoutAddress } from "@/lib/data/agent-registry";
import { getAgentSummary } from "@/lib/data/agents";
import { ACTIVE_CHAIN, USDG_ADDRESS, USDG_DECIMALS } from "@/lib/chain";
import { verifyUsdgTransfer } from "@/lib/verify-usdg";

const isServer = typeof window === "undefined";

/** Tools that can be purchased à la carte (USDG). */
export const X402_TOOLS = new Set([
  "ask",
  "generate_report",
  "scan_token",
  "get_radar",
  "get_alerts",
]);

/** Default USDG price per tool call when agent has no custom override. */
export function x402PriceUsdg(slug: string, tool: string): number {
  const agent = getAgentSummary(slug);
  if (!agent) return 0;
  // Free agents: small flat fee so ACP/agent callers can still settle in USDG.
  if (agent.pricing.model === "free" || agent.pricing.amount <= 0) {
    if (tool === "scan_token" || tool === "get_radar") return 0.25;
    if (tool === "ask") return 0.1;
    if (tool === "generate_report") return 0.5;
    return 0.1;
  }
  // Paid agents: ~5% of monthly price per call, floor $0.50 / ceil $5.
  const monthly = agent.pricing.amount;
  return Math.min(5, Math.max(0.5, Math.round(monthly * 0.05 * 100) / 100));
}

export function isX402Tool(tool: string): boolean {
  return X402_TOOLS.has(tool);
}

export interface X402Requirement {
  scheme: "exact";
  network: string;
  chainId: number;
  asset: string;
  assetSymbol: "USDG";
  decimals: number;
  payTo: string;
  maxAmountRequired: string;
  amountUsdg: number;
  resource: string;
  description: string;
  mimeType: string;
}

export function buildX402Requirement(slug: string, tool: string): X402Requirement | null {
  const payTo = getPayoutAddress(slug);
  if (!payTo) return null;
  const amountUsdg = x402PriceUsdg(slug, tool);
  if (amountUsdg <= 0) return null;
  const atomic = BigInt(Math.round(amountUsdg * 10 ** USDG_DECIMALS));
  return {
    scheme: "exact",
    network: "robinhood-chain",
    chainId: ACTIVE_CHAIN.chainIdDecimal,
    asset: USDG_ADDRESS,
    assetSymbol: "USDG",
    decimals: USDG_DECIMALS,
    payTo,
    maxAmountRequired: atomic.toString(),
    amountUsdg,
    resource: `/api/mcp/${slug}#${tool}`,
    description: `One ${tool} call on ${slug}`,
    mimeType: "application/json",
  };
}

export function hasUnconsumedX402Credit(slug: string, payer: string, tool: string): boolean {
  if (!isServer) return false;
  const row = db()
    .prepare(
      `SELECT id FROM x402_payments
       WHERE slug = ? AND payer = ? AND tool = ? AND consumed = 0
       ORDER BY id ASC LIMIT 1`
    )
    .get(slug, payer.toLowerCase(), tool) as { id: number } | undefined;
  return Boolean(row);
}

export function consumeX402Credit(slug: string, payer: string, tool: string): boolean {
  if (!isServer) return false;
  const row = db()
    .prepare(
      `SELECT id FROM x402_payments
       WHERE slug = ? AND payer = ? AND tool = ? AND consumed = 0
       ORDER BY id ASC LIMIT 1`
    )
    .get(slug, payer.toLowerCase(), tool) as { id: number } | undefined;
  if (!row) return false;
  db().prepare("UPDATE x402_payments SET consumed = 1 WHERE id = ?").run(row.id);
  return true;
}

export function isTxHashUsedForX402(txHash: string): boolean {
  if (!isServer) return false;
  const row = db()
    .prepare("SELECT 1 FROM x402_payments WHERE tx_hash = ?")
    .get(txHash.toLowerCase());
  return Boolean(row);
}

export async function recordX402Payment(input: {
  slug: string;
  tool: string;
  payer: string;
  txHash: string;
  amountUsdg: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const payTo = getPayoutAddress(input.slug);
  if (!payTo) return { ok: false, reason: "No payout address for this business" };
  if (!isX402Tool(input.tool)) return { ok: false, reason: "Tool is not x402-enabled" };
  if (isTxHashUsedForX402(input.txHash)) return { ok: false, reason: "Transaction already used" };

  const required = x402PriceUsdg(input.slug, input.tool);
  const verified = await verifyUsdgTransfer({
    txHash: input.txHash,
    from: input.payer,
    to: payTo,
    minAmountUsdg: required * 0.98,
  });
  if (!verified.ok) return { ok: false, reason: verified.reason ?? "Payment verification failed" };

  db()
    .prepare(
      `INSERT INTO x402_payments (slug, tool, payer, tx_hash, amount_usdg, at, consumed)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      input.slug,
      input.tool,
      input.payer.toLowerCase(),
      input.txHash.toLowerCase(),
      verified.amountUsdg ?? required,
      new Date().toISOString()
    );
  return { ok: true };
}

/** Sum of x402 USDG received by businesses owned by wallet (for earnings). */
export function listX402Earnings(owner: string): {
  slug: string;
  payer: string;
  tool: string;
  amountUsdg: number;
  txHash: string;
  at: string;
}[] {
  if (!isServer) return [];
  return db()
    .prepare(
      `SELECT x.slug, x.payer, x.tool, x.amount_usdg AS amountUsdg, x.tx_hash AS txHash, x.at
       FROM x402_payments x
       JOIN agents a ON a.slug = x.slug
       WHERE a.owner_address = ?
       ORDER BY x.at DESC`
    )
    .all(owner.toLowerCase()) as {
    slug: string;
    payer: string;
    tool: string;
    amountUsdg: number;
    txHash: string;
    at: string;
  }[];
}
