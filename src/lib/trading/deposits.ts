/**
 * Deposit tracking for live agents — sourced from the chain, not the client.
 * We scan Blockscout for USDG transfers into the agent wallet and record each
 * tx hash once. Net deposits form the PnL baseline shown in the UI.
 */

import { getAgent, recordDeposit } from "@/lib/trading/store";
import { USDG, USDG_DEC } from "@/lib/trading/dex";

const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_BASE?.trim() || "https://robinhoodchain.blockscout.com/api/v2";

interface BlockscoutTransfer {
  transaction_hash?: string;
  to?: { hash?: string };
  token?: { address?: string };
  total?: { value?: string; decimals?: string };
}

export async function syncDeposits(agentId: string): Promise<number> {
  const agent = getAgent(agentId);
  if (!agent?.walletAddress) return 0;

  const res = await fetch(
    `${BLOCKSCOUT_API}/addresses/${agent.walletAddress}/token-transfers?type=ERC-20&filter=to`,
    { signal: AbortSignal.timeout(12_000) }
  );
  if (!res.ok) return 0;
  const data = (await res.json()) as { items?: BlockscoutTransfer[] };

  let synced = 0;
  for (const item of data.items ?? []) {
    if (item.token?.address?.toLowerCase() !== USDG) continue;
    if (item.to?.hash?.toLowerCase() !== agent.walletAddress.toLowerCase()) continue;
    const hash = item.transaction_hash;
    if (!hash) continue;
    const decimals = Number(item.total?.decimals ?? USDG_DEC);
    const amount = Number(item.total?.value ?? 0) / 10 ** decimals;
    if (amount <= 0) continue;
    recordDeposit(agentId, "deposit", amount, hash.toLowerCase());
    synced += 1;
  }
  return synced;
}
