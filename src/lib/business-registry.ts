/**
 * Off-chain mirror of the on-chain Business Registry.
 * Every listed agent (built-in + launched) gets a row: slug → MCP, payout, price, creator.
 * When BUSINESS_REGISTRY_ADDRESS is set, entries are marked ready for on-chain sync.
 */

import { db } from "@/lib/db";
import { getAgentSummary, listAgents } from "@/lib/data/agents";
import { getAgentOwnerAddress, getPayoutAddress, isAgentListed } from "@/lib/data/agent-registry";
import { ACTIVE_CHAIN } from "@/lib/chain";

const isServer = typeof window === "undefined";

export interface RegistryEntry {
  slug: string;
  mcpUrl: string;
  payoutAddress: string | null;
  creatorAddress: string | null;
  priceModel: string;
  priceUsdCents: number;
  listed: boolean;
  metadataUri: string;
  pageUrl: string;
  chainId: number;
  onchainTx: string | null;
  updatedAt: string;
}

interface RegistryRow {
  slug: string;
  mcp_url: string;
  payout_address: string | null;
  creator_address: string | null;
  price_model: string;
  price_usd_cents: number;
  listed: number;
  metadata_uri: string;
  onchain_tx: string | null;
  updated_at: string;
}

function publicBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.BOWYER_PUBLIC_URL?.replace(/\/$/, "") ||
    "https://bowyer.app"
  );
}

function rowToEntry(row: RegistryRow): RegistryEntry {
  return {
    slug: row.slug,
    mcpUrl: row.mcp_url,
    payoutAddress: row.payout_address,
    creatorAddress: row.creator_address,
    priceModel: row.price_model,
    priceUsdCents: row.price_usd_cents,
    listed: row.listed === 1,
    metadataUri: row.metadata_uri,
    pageUrl: `${publicBase()}/agents/${row.slug}`,
    chainId: ACTIVE_CHAIN.chainIdDecimal,
    onchainTx: row.onchain_tx,
    updatedAt: row.updated_at,
  };
}

export function registryContractAddress(): string | null {
  const addr =
    process.env.BUSINESS_REGISTRY_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_BUSINESS_REGISTRY_ADDRESS?.trim();
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr : null;
}

export function upsertRegistryEntry(input: {
  slug: string;
  mcpUrl?: string;
  payoutAddress?: string | null;
  creatorAddress?: string | null;
  priceModel?: string;
  priceUsdCents?: number;
  listed?: boolean;
  metadataUri?: string;
  onchainTx?: string | null;
}): RegistryEntry {
  const d = db();
  const slug = input.slug;
  const mcpUrl = input.mcpUrl ?? `${publicBase()}/api/mcp/${slug}`;
  const metadataUri = input.metadataUri ?? `${publicBase()}/api/registry/${slug}`;
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO business_registry
       (slug, mcp_url, payout_address, creator_address, price_model, price_usd_cents, listed, metadata_uri, onchain_tx, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       mcp_url = excluded.mcp_url,
       payout_address = COALESCE(excluded.payout_address, business_registry.payout_address),
       creator_address = COALESCE(excluded.creator_address, business_registry.creator_address),
       price_model = excluded.price_model,
       price_usd_cents = excluded.price_usd_cents,
       listed = excluded.listed,
       metadata_uri = excluded.metadata_uri,
       onchain_tx = COALESCE(excluded.onchain_tx, business_registry.onchain_tx),
       updated_at = excluded.updated_at`
  ).run(
    slug,
    mcpUrl,
    input.payoutAddress?.toLowerCase() ?? null,
    input.creatorAddress?.toLowerCase() ?? null,
    input.priceModel ?? "free",
    input.priceUsdCents ?? 0,
    input.listed === false ? 0 : 1,
    metadataUri,
    input.onchainTx ?? null,
    now
  );
  return getRegistryEntry(slug)!;
}

export function getRegistryEntry(slug: string): RegistryEntry | null {
  if (!isServer) return null;
  const row = db()
    .prepare("SELECT * FROM business_registry WHERE slug = ?")
    .get(slug) as RegistryRow | undefined;
  return row ? rowToEntry(row) : null;
}

export function listRegistryEntries(opts?: { listedOnly?: boolean }): RegistryEntry[] {
  if (!isServer) return [];
  const listedOnly = opts?.listedOnly !== false;
  const rows = (
    listedOnly
      ? db().prepare("SELECT * FROM business_registry WHERE listed = 1 ORDER BY updated_at DESC").all()
      : db().prepare("SELECT * FROM business_registry ORDER BY updated_at DESC").all()
  ) as RegistryRow[];
  return rows.map(rowToEntry);
}

/** Mirror one agent summary into the registry. */
export function syncAgentToRegistry(slug: string): RegistryEntry | null {
  if (!isServer) return null;
  const agent = getAgentSummary(slug);
  if (!agent) return null;
  const priceModel =
    agent.pricing.model === "free" || agent.pricing.amount <= 0
      ? "free"
      : agent.pricing.model;
  const listed = isAgentListed(slug);
  return upsertRegistryEntry({
    slug,
    mcpUrl: `${publicBase()}/api/mcp/${slug}`,
    payoutAddress: getPayoutAddress(slug),
    creatorAddress: getAgentOwnerAddress(slug),
    priceModel,
    priceUsdCents: Math.round((agent.pricing.amount ?? 0) * 100),
    listed,
    metadataUri: `${publicBase()}/api/registry/${slug}`,
  });
}

/** Ensure every catalog + launched agent has a registry row. */
export function syncAllAgentsToRegistry(): { synced: number } {
  if (!isServer) return { synced: 0 };
  const agents = listAgents();
  let synced = 0;
  for (const a of agents) {
    syncAgentToRegistry(a.slug);
    synced += 1;
  }
  return { synced };
}

export function markRegistryOnchain(slug: string, txHash: string): boolean {
  if (!isServer) return false;
  const res = db()
    .prepare(
      "UPDATE business_registry SET onchain_tx = ?, updated_at = ? WHERE slug = ?"
    )
    .run(txHash.toLowerCase(), new Date().toISOString(), slug);
  return res.changes > 0;
}
