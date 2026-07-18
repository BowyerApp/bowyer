import { rpcUrl, USD_PER_ETH } from "@/lib/chain";

/**
 * Real on-chain scanner for Robinhood Chain. Reads recent blocks over JSON-RPC
 * and surfaces large native transfers — this is actual chain data, not LLM
 * imagination. Whale Hunter's get_alerts and reports are grounded in it.
 */

const SCAN_BLOCKS = 40;
const CACHE_TTL_MS = 60 * 1000;
const RPC_TIMEOUT_MS = 12_000;
/** Transfers >= this many ETH count as notable on a young chain. */
const MIN_NOTABLE_ETH = 0.5;

export interface ChainTransfer {
  hash: string;
  from: string;
  to: string | null;
  valueEth: number;
  valueUsd: number;
  blockNumber: number;
}

export interface ContractDeployment {
  txHash: string;
  deployer: string;
  valueEth: number;
  blockNumber: number;
}

export interface FundingCluster {
  funder: string;
  recipients: number;
  totalEth: number;
  blockCount: number;
}

export interface ChainScan {
  chainId: number;
  latestBlock: number;
  blocksScanned: number;
  totalTxs: number;
  notableTransfers: ChainTransfer[];
  topSenders: { address: string; txCount: number; totalEth: number }[];
  contractDeployments: ContractDeployment[];
  fundingClusters: FundingCluster[];
  scannedAt: string;
}

interface RpcBlock {
  number: string;
  transactions: {
    hash: string;
    from: string;
    to: string | null;
    value: string;
  }[];
}

const scanCaches = new Map<number, { at: number; scan: ChainScan }>();

// The public Robinhood Chain RPC returns 403 without a User-Agent.
const RPC_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 bowyer-runtime",
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: RPC_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  if (json.result === undefined) throw new Error(`RPC ${method}: empty result`);
  return json.result;
}

async function rpcBatch<T>(calls: { method: string; params: unknown[] }[]): Promise<T[]> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: RPC_HEADERS,
    body: JSON.stringify(
      calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: c.method, params: c.params }))
    ),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`RPC batch: HTTP ${res.status}`);
  const json = (await res.json()) as { id: number; result?: T }[];
  return json
    .sort((a, b) => a.id - b.id)
    .map((r) => r.result)
    .filter((r): r is T => r !== undefined && r !== null);
}

function weiHexToEth(hex: string): number {
  // Safe for display: convert via BigInt, keep 6 decimals.
  const wei = BigInt(hex);
  return Number((wei * BigInt(1_000_000)) / BigInt(1e18)) / 1_000_000;
}

/** Scan recent Robinhood Chain blocks. Cached for 60s per window size. */
export async function scanChain(blockWindow: number = SCAN_BLOCKS): Promise<ChainScan> {
  const window = Math.max(1, Math.min(blockWindow, 200));
  const cached = scanCaches.get(window);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.scan;

  const latestHex = await rpc<string>("eth_blockNumber", []);
  const latest = parseInt(latestHex, 16);
  const from = Math.max(0, latest - window + 1);

  const calls = [];
  for (let n = from; n <= latest; n++) {
    calls.push({ method: "eth_getBlockByNumber", params: [`0x${n.toString(16)}`, true] });
  }
  const blocks = await rpcBatch<RpcBlock>(calls);

  const transfers: ChainTransfer[] = [];
  const deployments: ContractDeployment[] = [];
  const senderStats = new Map<string, { txCount: number; totalEth: number }>();
  const funding = new Map<string, { recipients: Set<string>; totalEth: number; blocks: Set<number> }>();
  let totalTxs = 0;

  for (const block of blocks) {
    const blockNumber = parseInt(block.number, 16);
    for (const tx of block.transactions ?? []) {
      totalTxs++;
      const valueEth = weiHexToEth(tx.value);
      if (!tx.to) {
        deployments.push({
          txHash: tx.hash,
          deployer: tx.from,
          valueEth,
          blockNumber,
        });
      }
      if (valueEth <= 0) continue;

      const fromAddr = tx.from.toLowerCase();
      const s = senderStats.get(fromAddr) ?? { txCount: 0, totalEth: 0 };
      s.txCount++;
      s.totalEth += valueEth;
      senderStats.set(fromAddr, s);

      if (tx.to) {
        const cluster = funding.get(fromAddr) ?? { recipients: new Set<string>(), totalEth: 0, blocks: new Set<number>() };
        cluster.recipients.add(tx.to.toLowerCase());
        cluster.totalEth += valueEth;
        cluster.blocks.add(blockNumber);
        funding.set(fromAddr, cluster);
      }

      if (valueEth >= MIN_NOTABLE_ETH) {
        transfers.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          valueEth,
          valueUsd: Math.round(valueEth * USD_PER_ETH),
          blockNumber,
        });
      }
    }
  }

  transfers.sort((a, b) => b.valueEth - a.valueEth);

  const topSenders = [...senderStats.entries()]
    .map(([address, s]) => ({ address, ...s, totalEth: Math.round(s.totalEth * 1e4) / 1e4 }))
    .sort((a, b) => b.totalEth - a.totalEth)
    .slice(0, 5);
  const fundingClusters = [...funding.entries()]
    .filter(([, cluster]) => cluster.recipients.size >= 3)
    .map(([funder, cluster]) => ({
      funder,
      recipients: cluster.recipients.size,
      totalEth: Math.round(cluster.totalEth * 1e4) / 1e4,
      blockCount: cluster.blocks.size,
    }))
    .sort((a, b) => b.recipients - a.recipients || b.totalEth - a.totalEth)
    .slice(0, 10);

  const scan: ChainScan = {
    chainId: 4663,
    latestBlock: latest,
    blocksScanned: blocks.length,
    totalTxs,
    notableTransfers: transfers.slice(0, 10),
    topSenders,
    contractDeployments: deployments.slice(0, 20),
    fundingClusters,
    scannedAt: new Date().toISOString(),
  };

  scanCaches.set(window, { at: Date.now(), scan });
  return scan;
}

/** Format a scan as an honest context block for the LLM. */
export function formatChainContext(scan: ChainScan): string {
  const lines = [
    `Live Robinhood Chain scan (chain ${scan.chainId}, fetched ${scan.scannedAt}):`,
    `• Latest block: ${scan.latestBlock} — scanned last ${scan.blocksScanned} blocks, ${scan.totalTxs} transactions`,
  ];

  if (scan.notableTransfers.length > 0) {
    lines.push("Notable native transfers (largest first):");
    for (const t of scan.notableTransfers) {
      lines.push(
        `  - ${t.valueEth} ETH (~$${t.valueUsd.toLocaleString()}) ${t.from.slice(0, 10)}… → ${t.to ? t.to.slice(0, 10) + "…" : "contract creation"} · block ${t.blockNumber} · tx ${t.hash.slice(0, 14)}…`
      );
    }
  } else {
    lines.push(
      `No transfers above ${MIN_NOTABLE_ETH} ETH in the scanned window — activity is quiet right now. Report this honestly; do NOT invent whale movements.`
    );
  }

  if (scan.topSenders.length > 0) {
    lines.push("Most active senders in window:");
    for (const s of scan.topSenders) {
      lines.push(`  - ${s.address.slice(0, 12)}… · ${s.txCount} txs · ${s.totalEth} ETH total`);
    }
  }

  lines.push(
    "This is REAL on-chain data. Base your analysis strictly on it plus any web sources provided. Never fabricate transactions, wallets, or amounts."
  );
  return lines.join("\n");
}
