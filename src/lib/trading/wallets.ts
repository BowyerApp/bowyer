/**
 * Dedicated agent trading wallets.
 *
 * Live-mode agents trade from their own EOA, generated server-side. Security
 * model:
 * - Private keys are AES-256-GCM encrypted at rest with TRADING_WALLET_SECRET.
 *   Without that env var, live mode is disabled entirely (paper still works).
 * - The key is only ever used for two operations: swaps against whitelisted
 *   v2 pairs (see dex.ts) and withdrawals to the OWNER address stored at
 *   creation time. No API input can redirect funds anywhere else.
 * - Deposits are plain transfers the user signs from their own wallet.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { PrivateKeyAccount } from "viem";
import { db } from "@/lib/db";

function secret(): string | null {
  return process.env.TRADING_WALLET_SECRET?.trim() || null;
}

export function liveTradingEnabled(): boolean {
  return Boolean(secret());
}

function keyFor(salt: Buffer): Buffer {
  const s = secret();
  if (!s) throw new Error("TRADING_WALLET_SECRET not set — live trading disabled");
  return scryptSync(s, salt, 32);
}

function encrypt(plaintext: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(salt), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [salt, iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

function decrypt(ciphertext: string): string {
  const [salt, iv, tag, enc] = ciphertext.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", keyFor(salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Create (or return existing) trading wallet for an agent instance. */
export function ensureAgentWallet(agentId: string, owner: string): string {
  const existing = db()
    .prepare("SELECT address FROM trading_wallets WHERE agent_id = ?")
    .get(agentId) as { address: string } | undefined;
  if (existing) return existing.address;

  const pk = generatePrivateKey();
  const address = privateKeyToAccount(pk).address.toLowerCase();
  db()
    .prepare(
      "INSERT INTO trading_wallets (agent_id, owner, address, key_ciphertext) VALUES (?, ?, ?, ?)"
    )
    .run(agentId, owner.toLowerCase(), address, encrypt(pk));
  return address;
}

export interface AgentWallet {
  account: PrivateKeyAccount;
  address: string;
  /** The only address withdrawals may ever target. */
  owner: string;
}

export function loadAgentWallet(agentId: string): AgentWallet | null {
  const row = db()
    .prepare("SELECT owner, address, key_ciphertext FROM trading_wallets WHERE agent_id = ?")
    .get(agentId) as { owner: string; address: string; key_ciphertext: string } | undefined;
  if (!row) return null;
  const pk = decrypt(row.key_ciphertext) as `0x${string}`;
  return { account: privateKeyToAccount(pk), address: row.address, owner: row.owner };
}
