import { rpcUrl } from "@/lib/chain";
import { scanChain } from "@/lib/chain-scanner";

const HEADERS = { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 bowyer-meme-radar" };
const TIMEOUT_MS = 12_000;
const DEXSCREENER_CHAIN_ID = process.env.DEXSCREENER_CHAIN_ID?.trim() || "robinhood";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error || body.result === undefined) throw new Error(body.error?.message ?? `RPC ${method} failed`);
  return body.result;
}

function dynamicString(hex: string): string | null {
  try {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (clean.length < 192) return null;
    const offset = Number(BigInt(`0x${clean.slice(0, 64)}`)) * 2;
    const length = Number(BigInt(`0x${clean.slice(offset, offset + 64)}`));
    if (!Number.isSafeInteger(length) || length < 1 || length > 256) return null;
    return Buffer.from(clean.slice(offset + 64, offset + 64 + length * 2), "hex").toString("utf8").replace(/\0/g, "");
  } catch {
    return null;
  }
}

async function call(address: string, data: string): Promise<string | null> {
  try {
    return await rpc<string>("eth_call", [{ to: address, data }, "latest"]);
  } catch {
    return null;
  }
}

/** Parse an RPC hex quantity, treating empty ("0x") or malformed results as null. */
function hexToBigInt(hex: string | null): bigint | null {
  if (!hex || hex === "0x") return null;
  try {
    return BigInt(hex);
  } catch {
    return null;
  }
}

export interface TokenRiskScan {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  supply: string | null;
  bytecodeBytes: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: string[];
  market: {
    configuredChainId: string;
    pairAddress: string;
    dexId: string;
    priceUsd: number | null;
    liquidityUsd: number | null;
    volume24h: number | null;
    buys5m: number | null;
    sells5m: number | null;
    pairCreatedAt: string | null;
    url: string;
  } | null;
  unavailableChecks: string[];
  scannedAt: string;
}

interface DexPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  txns?: { m5?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
  url?: string;
}

async function getDexPair(address: string): Promise<TokenRiskScan["market"]> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      headers: { "User-Agent": "bowyer-meme-radar" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { pairs?: DexPair[] };
    const pairs = (body.pairs ?? []).filter((pair) => pair.chainId === DEXSCREENER_CHAIN_ID);
    const pair = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (!pair?.pairAddress || !pair.url) return null;
    const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    const price = Number(pair.priceUsd);
    return {
      configuredChainId: DEXSCREENER_CHAIN_ID,
      pairAddress: pair.pairAddress,
      dexId: pair.dexId ?? "unknown",
      priceUsd: Number.isFinite(price) ? price : null,
      liquidityUsd: num(pair.liquidity?.usd),
      volume24h: num(pair.volume?.h24),
      buys5m: num(pair.txns?.m5?.buys),
      sells5m: num(pair.txns?.m5?.sells),
      pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
      url: pair.url,
    };
  } catch {
    return null;
  }
}

/** Generic EVM contract inspection. It intentionally does not claim honeypot or liquidity results without a compatible provider. */
export async function scanTokenRisk(address: string): Promise<TokenRiskScan> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("A valid EVM token address is required");
  const normalized = address.toLowerCase();
  const [code, nameRaw, symbolRaw, decimalsRaw, supplyRaw, market] = await Promise.all([
    rpc<string>("eth_getCode", [normalized, "latest"]),
    call(normalized, "0x06fdde03"),
    call(normalized, "0x95d89b41"),
    call(normalized, "0x313ce567"),
    call(normalized, "0x18160ddd"),
    getDexPair(normalized),
  ]);
  const bytecodeBytes = Math.max(0, (code.length - 2) / 2);
  const flags: string[] = [];
  let score = 0;
  if (bytecodeBytes === 0) {
    flags.push("No contract bytecode at this address");
    score = 100;
  } else if (bytecodeBytes < 200) {
    flags.push("Very small contract bytecode — inspect manually");
    score += 35;
  }
  const name = nameRaw ? dynamicString(nameRaw) : null;
  const symbol = symbolRaw ? dynamicString(symbolRaw) : null;
  const decimalsBig = hexToBigInt(decimalsRaw);
  const decimals = decimalsBig !== null ? Number(decimalsBig) : null;
  if (!name || !symbol || decimals == null || !Number.isSafeInteger(decimals) || decimals > 36) {
    flags.push("Token metadata is incomplete or non-standard");
    score += 20;
  }
  if (!market) {
    flags.push(`No DexScreener pool found on configured chain "${DEXSCREENER_CHAIN_ID}"`);
    score += 15;
  } else {
    if ((market.liquidityUsd ?? 0) < 10_000) {
      flags.push("Very low DEX liquidity");
      score += 25;
    }
    if ((market.buys5m ?? 0) >= 10 && (market.sells5m ?? 0) === 0) {
      flags.push("One-sided recent trading — verify sellability independently");
      score += 20;
    }
  }
  const supply = hexToBigInt(supplyRaw)?.toString() ?? null;
  const riskScore = Math.min(100, score);
  return {
    address: normalized,
    name,
    symbol,
    decimals: Number.isSafeInteger(decimals) ? decimals : null,
    supply,
    bytecodeBytes,
    riskScore,
    riskLevel: riskScore >= 75 ? "critical" : riskScore >= 45 ? "high" : riskScore >= 20 ? "medium" : "low",
    flags,
    market,
    unavailableChecks: [
      "Liquidity lock ownership requires a Robinhood Chain-compatible indexer.",
      "Honeypot and sell-tax simulation require a compatible transaction simulator.",
      "This scan is contract metadata and bytecode presence only — not a safety guarantee.",
    ],
    scannedAt: new Date().toISOString(),
  };
}

/** Blocks to scan for the radar — deeper than the default whale window. */
const RADAR_SCAN_BLOCKS = 120;
/** How many recent deployments to enrich with contract/token/market data. */
const ENRICH_LIMIT = 8;

export interface RadarCandidate {
  txHash: string;
  deployer: string;
  valueEth: number;
  blockNumber: number;
  contractAddress: string | null;
  token: { name: string | null; symbol: string | null; decimals: number | null } | null;
  market: TokenRiskScan["market"];
  lifecycle: "forming" | "trading";
  score: number;
}

async function contractAddressFor(txHash: string): Promise<string | null> {
  try {
    const receipt = await rpc<{ contractAddress?: string | null }>(
      "eth_getTransactionReceipt",
      [txHash]
    );
    return receipt?.contractAddress?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function tokenMetadata(address: string) {
  const [nameRaw, symbolRaw, decimalsRaw] = await Promise.all([
    call(address, "0x06fdde03"),
    call(address, "0x95d89b41"),
    call(address, "0x313ce567"),
  ]);
  const name = nameRaw ? dynamicString(nameRaw) : null;
  const symbol = symbolRaw ? dynamicString(symbolRaw) : null;
  const decimalsBig = hexToBigInt(decimalsRaw);
  const decimals = decimalsBig !== null ? Number(decimalsBig) : null;
  if (!name && !symbol) return null;
  return { name, symbol, decimals: Number.isSafeInteger(decimals) ? decimals : null };
}

export async function getMemeRadar() {
  const chain = await scanChain(RADAR_SCAN_BLOCKS);

  const launchCandidates: RadarCandidate[] = await Promise.all(
    chain.contractDeployments.slice(0, ENRICH_LIMIT).map(async (deployment) => {
      const contractAddress = await contractAddressFor(deployment.txHash);
      const [token, market] = contractAddress
        ? await Promise.all([tokenMetadata(contractAddress), getDexPair(contractAddress)])
        : [null, null];
      let score = 35 + (deployment.valueEth >= 0.5 ? 25 : 0);
      if (token?.symbol) score += 10;
      if (market) score += Math.min(20, Math.floor((market.liquidityUsd ?? 0) / 5_000));
      return {
        ...deployment,
        contractAddress,
        token,
        market,
        lifecycle: market ? ("trading" as const) : ("forming" as const),
        score: Math.min(100, score),
      };
    })
  );

  const clusters = chain.fundingClusters.map((cluster) => ({
    ...cluster,
    lifecycle: "coordinated-funding" as const,
    score: Math.min(100, cluster.recipients * 12 + (cluster.totalEth >= 1 ? 15 : 0)),
  }));

  return {
    chainId: chain.chainId,
    scannedAt: chain.scannedAt,
    blockRange: {
      from: chain.latestBlock - chain.blocksScanned + 1,
      to: chain.latestBlock,
      blocksScanned: chain.blocksScanned,
    },
    methodology:
      "EVM contract-deployment detection over recent Robinhood Chain blocks, enriched with token metadata (eth_call) and DexScreener market data where a pool exists. Funding clusters are direct native-transfer fan-outs. No price prediction or trade execution.",
    launchCandidates: launchCandidates.sort((a, b) => b.score - a.score),
    clusters,
    unavailableChecks: [
      "Holder distribution and dev-wallet sell tracing require an indexer for Robinhood Chain; use scan_token on a specific address for contract-level risk flags.",
    ],
  };
}
