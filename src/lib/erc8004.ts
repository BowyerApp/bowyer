/**
 * ERC-8004 (Trustless Agents) integration.
 *
 * Every Bowyer agent gets a spec-compliant registration file served at
 * /api/erc8004/[slug]. When ERC8004_IDENTITY_REGISTRY + ERC8004_REGISTRAR_KEY
 * are configured, agents can be registered onchain (Identity Registry
 * `register(agentURI)`), making them discoverable and hireable by any agent
 * in the ERC-8004 ecosystem — reputation composes with our existing x402
 * payment rails.
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getAgentSummary, listAgents } from "@/lib/data/agents";
import { getAgentAvatarGlb } from "@/lib/agent-avatars";
import { db } from "@/lib/db";

const SITE = "https://bowyer.app";

const IDENTITY_REGISTRY_ABI = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
]);

function registryConfig(): {
  registry: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  key: `0x${string}`;
} | null {
  const registry = process.env.ERC8004_IDENTITY_REGISTRY?.trim();
  const key = process.env.ERC8004_REGISTRAR_KEY?.trim();
  const rpcUrl = process.env.ERC8004_RPC_URL?.trim();
  const chainId = Number(process.env.ERC8004_CHAIN_ID ?? "8453"); // default Base
  if (!registry || !key || !rpcUrl) return null;
  return {
    registry: registry as `0x${string}`,
    rpcUrl,
    chainId,
    key: (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`,
  };
}

export function erc8004Enabled(): boolean {
  return registryConfig() !== null;
}

function ensureTable() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS erc8004_registrations (
      slug TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      registry TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      registered_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function getRegistration(
  slug: string
): { agentId: string; registry: string; chainId: number; txHash: string } | null {
  ensureTable();
  const r = db()
    .prepare("SELECT agent_id, registry, chain_id, tx_hash FROM erc8004_registrations WHERE slug = ?")
    .get(slug) as { agent_id: string; registry: string; chain_id: number; tx_hash: string } | undefined;
  return r
    ? { agentId: r.agent_id, registry: r.registry, chainId: r.chain_id, txHash: r.tx_hash }
    : null;
}

/** ERC-8004 registration file (registration-v1) for a catalog agent. */
export function buildRegistrationFile(slug: string): Record<string, unknown> | null {
  const agent = getAgentSummary(slug);
  if (!agent) return null;

  const avatar = getAgentAvatarGlb(slug);
  const reg = getRegistration(slug);

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: agent.name,
    description: `${agent.tagline}. ${agent.thesis ?? ""}`.trim(),
    image: avatar ? `${SITE}${avatar}` : `${SITE}/og.png`,
    services: [
      { name: "web", endpoint: `${SITE}/agents/${slug}` },
      { name: "MCP", endpoint: `${SITE}/api/mcp/${slug}`, version: "2024-11-05" },
    ],
    x402Support: true,
    active: true,
    registrations: reg
      ? [{ agentId: Number(reg.agentId), agentRegistry: `eip155:${reg.chainId}:${reg.registry}` }]
      : [],
    supportedTrust: ["reputation"],
  };
}

export function listRegistrableSlugs(): string[] {
  return listAgents().map((a) => a.slug);
}

/**
 * Register one agent in the onchain Identity Registry. Idempotent per slug —
 * already-registered agents are skipped.
 */
export async function registerAgentOnchain(
  slug: string
): Promise<{ ok: boolean; agentId?: string; txHash?: string; error?: string }> {
  const cfg = registryConfig();
  if (!cfg) return { ok: false, error: "ERC-8004 env not configured" };
  if (!getAgentSummary(slug)) return { ok: false, error: `unknown agent: ${slug}` };
  if (getRegistration(slug)) return { ok: true, ...getRegistration(slug)! };

  const account = privateKeyToAccount(cfg.key);
  const chain = {
    id: cfg.chainId,
    name: `erc8004-${cfg.chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  };
  const walletClient = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

  const agentURI = `${SITE}/api/erc8004/${slug}`;
  try {
    const { request, result } = await publicClient.simulateContract({
      address: cfg.registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "register",
      args: [agentURI],
      account,
    });
    const txHash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });

    const agentId = String(result ?? "");
    ensureTable();
    db()
      .prepare(
        `INSERT OR REPLACE INTO erc8004_registrations (slug, agent_id, registry, chain_id, tx_hash)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(slug, agentId, cfg.registry, cfg.chainId, txHash);
    return { ok: true, agentId, txHash };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
