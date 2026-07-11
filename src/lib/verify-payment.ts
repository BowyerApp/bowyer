import { rpcUrl, usdToWei } from "@/lib/chain";

/**
 * Server-side on-chain payment verification.
 * Confirms via JSON-RPC that a transaction:
 *   1. exists and is mined with a successful receipt,
 *   2. was sent from the subscriber's wallet,
 *   3. pays the creator's payout address,
 *   4. transfers at least the expected amount (2% tolerance for rate drift).
 */

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

interface RpcTransaction {
  from: string;
  to: string | null;
  value: string;
  blockNumber: string | null;
}

interface RpcReceipt {
  status: string;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    // The public Robinhood Chain RPC returns 403 without a User-Agent.
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 bowyer-runtime",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    // Payment verification must not hang the request forever.
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method} failed: ${json.error.message}`);
  return json.result ?? null;
}

export async function verifyPayment(options: {
  txHash: string;
  from: string;
  to: string;
  amountUsd: number;
}): Promise<VerifyResult> {
  const { txHash, from, to, amountUsd } = options;

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, reason: "Malformed transaction hash" };
  }

  let tx: RpcTransaction | null;
  try {
    tx = await rpc<RpcTransaction>("eth_getTransactionByHash", [txHash]);
  } catch (err) {
    return {
      ok: false,
      reason: `Could not reach chain RPC: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
  if (!tx) return { ok: false, reason: "Transaction not found on chain" };

  if (tx.from.toLowerCase() !== from.toLowerCase()) {
    return { ok: false, reason: "Transaction sender does not match subscriber wallet" };
  }
  if (!tx.to || tx.to.toLowerCase() !== to.toLowerCase()) {
    return { ok: false, reason: "Transaction recipient does not match creator payout address" };
  }

  const paidWei = BigInt(tx.value);
  const expectedWei = usdToWei(amountUsd);
  const minimumWei = (expectedWei * BigInt(98)) / BigInt(100);
  if (paidWei < minimumWei) {
    return { ok: false, reason: "Payment amount is below the subscription price" };
  }

  // Wait briefly for the tx to mine if it was just broadcast (L2 blocks are fast).
  for (let attempt = 0; attempt < 5; attempt++) {
    let receipt: RpcReceipt | null;
    try {
      receipt = await rpc<RpcReceipt>("eth_getTransactionReceipt", [txHash]);
    } catch {
      receipt = null;
    }
    if (receipt) {
      return receipt.status === "0x1"
        ? { ok: true }
        : { ok: false, reason: "Transaction reverted on chain" };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  return { ok: false, reason: "Transaction not yet mined — try again in a few seconds" };
}
