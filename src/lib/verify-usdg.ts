/**
 * Verify an ERC-20 USDG Transfer on Robinhood Chain for x402 pay-per-call.
 */

import { rpcUrl, USDG_ADDRESS, USDG_DECIMALS } from "@/lib/chain";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface VerifyUsdgResult {
  ok: boolean;
  reason?: string;
  amountUsdg?: number;
}

function padTopicAddress(addr: string): string {
  return "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export async function verifyUsdgTransfer(options: {
  txHash: string;
  from: string;
  to: string;
  minAmountUsdg: number;
}): Promise<VerifyUsdgResult> {
  const txHash = options.txHash.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
    return { ok: false, reason: "Invalid transaction hash" };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(options.from) || !/^0x[0-9a-fA-F]{40}$/.test(options.to)) {
    return { ok: false, reason: "Invalid wallet address" };
  }

  try {
    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 bowyer-runtime" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, reason: `RPC HTTP ${res.status}` };
    const json = (await res.json()) as {
      result?: {
        status?: string;
        logs?: { address?: string; topics?: string[]; data?: string }[];
      };
      error?: { message: string };
    };
    if (json.error) return { ok: false, reason: json.error.message };
    const receipt = json.result;
    if (!receipt) return { ok: false, reason: "Transaction not found" };
    if (receipt.status !== "0x1") return { ok: false, reason: "Transaction failed on chain" };

    const fromTopic = padTopicAddress(options.from);
    const toTopic = padTopicAddress(options.to);
    const minAtomic = BigInt(Math.round(options.minAmountUsdg * 10 ** USDG_DECIMALS));

    for (const log of receipt.logs ?? []) {
      if ((log.address ?? "").toLowerCase() !== USDG_ADDRESS) continue;
      const topics = log.topics ?? [];
      if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
      if ((topics[1] ?? "").toLowerCase() !== fromTopic) continue;
      if ((topics[2] ?? "").toLowerCase() !== toTopic) continue;
      const amount = BigInt(log.data || "0x0");
      if (amount < minAtomic) {
        return {
          ok: false,
          reason: `USDG amount too low (need ≥ ${options.minAmountUsdg})`,
        };
      }
      const amountUsdg = Number(amount) / 10 ** USDG_DECIMALS;
      return { ok: true, amountUsdg };
    }
    return { ok: false, reason: "No matching USDG Transfer to payout address" };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "RPC verification failed",
    };
  }
}
