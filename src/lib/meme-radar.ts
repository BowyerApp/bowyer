import { rpcUrl, USD_PER_ETH } from "@/lib/chain";
import { scanChain } from "@/lib/chain-scanner";

const HEADERS = { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 bowyer-meme-radar" };
const TIMEOUT_MS = 12_000;
const DEXSCREENER_CHAIN_ID = process.env.DEXSCREENER_CHAIN_ID?.trim() || "robinhood";

const RPC_RETRY_DELAYS_MS = [1000, 3000];

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError: Error = new Error(`RPC ${method} failed`);
  for (let attempt = 0; attempt <= RPC_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(rpcUrl(), {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`RPC ${method}: HTTP ${res.status}`);
      } else if (!res.ok) {
        throw new Error(`RPC ${method}: HTTP ${res.status}`);
      } else {
        const body = (await res.json()) as { result?: T; error?: { message?: string } };
        if (body.error || body.result === undefined)
          throw new Error(body.error?.message ?? `RPC ${method} failed`);
        return body.result;
      }
    } catch (err) {
      if (err instanceof Error && /HTTP 4(?!29)/.test(err.message)) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < RPC_RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RPC_RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
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

/** EIP-1967 implementation storage slot. */
const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export interface ProxyInfo {
  type: "eip1167" | "eip1967";
  implementation: string;
  implementationBytecodeBytes: number;
}

/** Detect minimal (EIP-1167) and transparent (EIP-1967) proxies and resolve the implementation. */
async function resolveProxy(address: string, code: string): Promise<ProxyInfo | null> {
  // EIP-1167: 363d3d373d3d3d363d73<20-byte impl>5af43d82803e903d91602b57fd5bf3
  const minimal = code
    .toLowerCase()
    .match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/);
  let type: ProxyInfo["type"] | null = null;
  let implementation: string | null = null;
  if (minimal) {
    type = "eip1167";
    implementation = `0x${minimal[1]}`;
  } else {
    try {
      const raw = await rpc<string>("eth_getStorageAt", [address, EIP1967_IMPL_SLOT, "latest"]);
      const impl = raw && raw.length === 66 ? `0x${raw.slice(26)}` : null;
      if (impl && impl !== `0x${"0".repeat(40)}`) {
        type = "eip1967";
        implementation = impl;
      }
    } catch {
      // Not a proxy or storage read unavailable.
    }
  }
  if (!type || !implementation) return null;
  let implBytes = 0;
  try {
    const implCode = await rpc<string>("eth_getCode", [implementation, "latest"]);
    implBytes = Math.max(0, (implCode.length - 2) / 2);
  } catch {
    implBytes = 0;
  }
  return { type, implementation, implementationBytecodeBytes: implBytes };
}

/* ---------- holder distribution via Blockscout ---------- */

const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_BASE?.trim() ||
  "https://robinhoodchain.blockscout.com/api/v2";

export interface HolderInfo {
  count: number | null;
  topHolders: { address: string; pct: number; isContract: boolean; label: string | null }[];
  top10Pct: number | null;
  source: string;
}

interface BlockscoutHolder {
  address?: {
    hash?: string;
    is_contract?: boolean;
    name?: string | null;
    proxy_type?: string | null;
  };
  value?: string;
}

/** Top-holder distribution from the Robinhood Chain Blockscout indexer. */
async function getHolderInfo(address: string, totalSupply: bigint | null): Promise<HolderInfo | null> {
  try {
    const [infoRes, holdersRes] = await Promise.all([
      fetch(`${BLOCKSCOUT_API}/tokens/${address}`, {
        headers: { "User-Agent": "bowyer-meme-radar" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      fetch(`${BLOCKSCOUT_API}/tokens/${address}/holders`, {
        headers: { "User-Agent": "bowyer-meme-radar" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    ]);
    if (!holdersRes.ok) return null;
    const info = infoRes.ok
      ? ((await infoRes.json()) as { holders_count?: string; total_supply?: string })
      : {};
    const holdersBody = (await holdersRes.json()) as { items?: BlockscoutHolder[] };
    const supply =
      totalSupply ?? (info.total_supply ? hexSafeBigInt(info.total_supply) : null);

    const items = (holdersBody.items ?? []).slice(0, 10);
    const topHolders = items
      .filter((h) => h.address?.hash && h.value)
      .map((h) => {
        let pct = 0;
        try {
          if (supply && supply > BigInt(0)) {
            pct = Number((BigInt(h.value!) * BigInt(10_000)) / supply) / 100;
          }
        } catch {
          pct = 0;
        }
        return {
          address: h.address!.hash!,
          pct,
          isContract: Boolean(h.address?.is_contract),
          label: h.address?.name ?? h.address?.proxy_type ?? null,
        };
      });
    const top10Pct = topHolders.length
      ? Math.round(topHolders.reduce((sum, h) => sum + h.pct, 0) * 100) / 100
      : null;
    return {
      count: info.holders_count ? Number(info.holders_count) : null,
      topHolders,
      top10Pct,
      source: BLOCKSCOUT_API,
    };
  } catch {
    return null;
  }
}

function hexSafeBigInt(value: string): bigint | null {
  try {
    return BigInt(value);
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
  proxy: ProxyInfo | null;
  holders: HolderInfo | null;
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

/** Contract inspection with proxy resolution and Blockscout holder data. It does not claim honeypot or sell-tax results without a simulator. */
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

  // A small contract may be a proxy — resolve before judging bytecode size.
  const proxy = bytecodeBytes > 0 ? await resolveProxy(normalized, code) : null;

  if (bytecodeBytes === 0) {
    flags.push("No contract bytecode at this address");
    score = 100;
  } else if (proxy) {
    flags.push(
      `${proxy.type === "eip1167" ? "Minimal proxy (EIP-1167)" : "Upgradeable proxy (EIP-1967)"} → implementation ${proxy.implementation} (${proxy.implementationBytecodeBytes} bytes)`
    );
    if (proxy.implementationBytecodeBytes === 0) {
      flags.push("Proxy implementation has no bytecode — critical");
      score += 60;
    } else if (proxy.type === "eip1967") {
      flags.push("Upgradeable — implementation logic can change after launch");
      score += 15;
    }
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

  const supplyBig = hexToBigInt(supplyRaw);
  const holders = await getHolderInfo(normalized, supplyBig);
  if (holders) {
    const topNonPool = holders.topHolders.filter((h) => !h.isContract);
    const biggestWallet = topNonPool[0];
    if (biggestWallet && biggestWallet.pct >= 20) {
      flags.push(
        `Single wallet ${biggestWallet.address.slice(0, 10)}… holds ${biggestWallet.pct}% of supply`
      );
      score += 25;
    }
    if ((holders.count ?? Infinity) < 50) {
      flags.push(`Only ${holders.count} holders`);
      score += 15;
    }
  }

  const supply = supplyBig?.toString() ?? null;
  const riskScore = Math.min(100, score);
  const unavailableChecks = [
    "Honeypot and sell-tax simulation require a compatible transaction simulator.",
    "This scan is not a safety guarantee.",
  ];
  if (!holders) {
    unavailableChecks.unshift(
      "Holder distribution unavailable — Blockscout indexer did not return data for this address."
    );
  }

  return {
    address: normalized,
    name,
    symbol,
    decimals: Number.isSafeInteger(decimals) ? decimals : null,
    supply,
    bytecodeBytes,
    proxy,
    holders,
    riskScore,
    riskLevel: riskScore >= 75 ? "critical" : riskScore >= 45 ? "high" : riskScore >= 20 ? "medium" : "low",
    flags,
    market,
    unavailableChecks,
    scannedAt: new Date().toISOString(),
  };
}

/** Blocks to scan for the radar — deeper than the default whale window. */
const RADAR_SCAN_BLOCKS = 200;
/** How many recent deployments to enrich with contract/token/market data. */
const ENRICH_LIMIT = 8;

/* ---------- factory-launch detection via event logs ----------
 * Robinhood Chain mints ~10 blocks/sec and nearly all tokens launch through
 * launchpads / DEX factories, so tx-level deployment scanning misses them.
 * Pool-creation events are the real launch signal.
 */

/** Uniswap v3 PoolCreated(token0,token1,fee,tickSpacing,pool). */
const V3_POOL_CREATED = "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118";
/** Uniswap v2 PairCreated(token0,token1,pair,allPairsLength). */
const V2_PAIR_CREATED = "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";

/** How far back the launch radar looks, in wall-clock minutes. */
const RADAR_WINDOW_MINUTES = Math.max(
  10,
  Number(process.env.RADAR_WINDOW_MINUTES ?? 60) || 60
);
/** Hard cap on the log-scan block span, whatever the chain cadence says. */
const MAX_LOG_SPAN_BLOCKS = 200_000;
/** How many of the freshest launches to check against DexScreener. */
const MARKET_CHECK_LIMIT = 60;

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
}

/** getLogs with a halving fallback for providers that cap range or result size. */
async function getLogsRange(topic0: string, fromBlock: number, toBlock: number, depth = 0): Promise<RawLog[]> {
  try {
    return await rpc<RawLog[]>("eth_getLogs", [
      {
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [topic0],
      },
    ]);
  } catch (err) {
    if (depth >= 3 || toBlock - fromBlock < 2_000) throw err;
    const mid = Math.floor((fromBlock + toBlock) / 2);
    const [a, b] = await Promise.all([
      getLogsRange(topic0, fromBlock, mid, depth + 1),
      getLogsRange(topic0, mid + 1, toBlock, depth + 1),
    ]);
    return [...a, ...b];
  }
}

async function blockTimestamp(blockNumber: number): Promise<number | null> {
  try {
    const block = await rpc<{ timestamp?: string }>("eth_getBlockByNumber", [
      `0x${blockNumber.toString(16)}`,
      false,
    ]);
    return block?.timestamp ? Number(BigInt(block.timestamp)) : null;
  } catch {
    return null;
  }
}

interface PoolEvent {
  dex: "v3" | "v2";
  token0: string;
  token1: string;
  pool: string;
  blockNumber: number;
}

function parsePoolEvent(log: RawLog, dex: "v3" | "v2"): PoolEvent | null {
  try {
    if (!log.topics[1] || !log.topics[2]) return null;
    const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
    // v3 data = tickSpacing(32) + pool(32); v2 data = pair(32) + allPairsLength(32)
    const poolWord = dex === "v3" ? data.slice(64, 128) : data.slice(0, 64);
    const pool = `0x${poolWord.slice(24)}`.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(pool)) return null;
    return {
      dex,
      token0: `0x${log.topics[1].slice(26)}`.toLowerCase(),
      token1: `0x${log.topics[2].slice(26)}`.toLowerCase(),
      pool,
      blockNumber: Number(BigInt(log.blockNumber)),
    };
  } catch {
    return null;
  }
}

/** DexScreener lookup for up to 30 tokens per call; keyed by lowercase token address. */
async function batchDexPairs(addresses: string[]): Promise<Map<string, NonNullable<TokenRiskScan["market"]>>> {
  const out = new Map<string, NonNullable<TokenRiskScan["market"]>>();
  for (let i = 0; i < addresses.length; i += 30) {
    const chunk = addresses.slice(i, i + 30);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`, {
        headers: { "User-Agent": "bowyer-meme-radar" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { pairs?: (DexPair & { baseToken?: { address?: string } })[] };
      for (const pair of body.pairs ?? []) {
        if (pair.chainId !== DEXSCREENER_CHAIN_ID) continue;
        const base = pair.baseToken?.address?.toLowerCase();
        if (!base || !pair.pairAddress || !pair.url) continue;
        const existing = out.get(base);
        if (existing && (existing.liquidityUsd ?? 0) >= (pair.liquidity?.usd ?? 0)) continue;
        const price = Number(pair.priceUsd);
        const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
        out.set(base, {
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
        });
      }
    } catch {
      // Chunk failed — later chunks may still succeed.
    }
  }
  return out;
}

/** Paired-quote depth held by the pool, as a USD estimate (for pools DexScreener hasn't indexed yet). */
async function poolQuoteDepthUsd(
  pool: string,
  quote: string,
  quoteDecimals: number,
  quoteIsWeth: boolean
): Promise<number | null> {
  const balanceRaw = await call(quote, `0x70a08231000000000000000000000000${pool.slice(2)}`);
  const balance = hexToBigInt(balanceRaw);
  if (balance === null) return null;
  const units = Number(balance) / 10 ** quoteDecimals;
  if (!Number.isFinite(units)) return null;
  // Pool holds the quote side once; total depth ≈ 2x one side.
  return Math.round(units * (quoteIsWeth ? USD_PER_ETH : 1) * 2);
}

export interface RadarLaunch {
  token: string;
  name: string | null;
  symbol: string | null;
  pairedWith: string;
  pairedSymbol: string | null;
  pool: string;
  dex: "v3" | "v2";
  poolCount: number;
  firstBlock: number;
  lastBlock: number;
  ageMinutes: number | null;
  market: TokenRiskScan["market"];
  onChainDepthUsd: number | null;
  score: number;
}

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

  /* ---- launch discovery: DEX pool creations over a wide time window ---- */

  const latestBlock = chain.latestBlock;
  // Measure real chain cadence from timestamps — block numbers alone are
  // meaningless on a chain minting ~10 blocks/sec.
  const cadenceSpan = Math.min(20_000, latestBlock - 1);
  const [tsLatest, tsEarlier] = await Promise.all([
    blockTimestamp(latestBlock),
    blockTimestamp(latestBlock - cadenceSpan),
  ]);
  const blocksPerSecond =
    tsLatest && tsEarlier && tsLatest > tsEarlier ? cadenceSpan / (tsLatest - tsEarlier) : 2;
  const windowBlocks = Math.min(
    MAX_LOG_SPAN_BLOCKS,
    Math.max(RADAR_SCAN_BLOCKS, Math.round(RADAR_WINDOW_MINUTES * 60 * blocksPerSecond))
  );
  const fromBlock = Math.max(1, latestBlock - windowBlocks);

  let poolEvents: PoolEvent[] = [];
  try {
    const [v3Logs, v2Logs] = await Promise.all([
      getLogsRange(V3_POOL_CREATED, fromBlock, latestBlock),
      getLogsRange(V2_PAIR_CREATED, fromBlock, latestBlock),
    ]);
    poolEvents = [
      ...v3Logs.map((log) => parsePoolEvent(log, "v3" as const)),
      ...v2Logs.map((log) => parsePoolEvent(log, "v2" as const)),
    ].filter((e): e is PoolEvent => e !== null);
  } catch {
    // Log scan unavailable — the radar still reports deploys and clusters.
  }

  // Quote tokens (WETH, stables) appear in a large share of pools; the rare
  // side of each pair is the launch.
  const tokenFreq = new Map<string, number>();
  for (const event of poolEvents) {
    tokenFreq.set(event.token0, (tokenFreq.get(event.token0) ?? 0) + 1);
    tokenFreq.set(event.token1, (tokenFreq.get(event.token1) ?? 0) + 1);
  }
  const quoteThreshold = Math.max(8, Math.ceil(poolEvents.length * 0.05));
  const isQuote = (address: string) => (tokenFreq.get(address) ?? 0) >= quoteThreshold;

  const launchMap = new Map<
    string,
    { token: string; pairedWith: string; pool: string; dex: "v3" | "v2"; poolCount: number; firstBlock: number; lastBlock: number }
  >();
  for (const event of poolEvents) {
    const token0Quote = isQuote(event.token0);
    const token1Quote = isQuote(event.token1);
    if (token0Quote && token1Quote) continue; // quote/quote pool — infrastructure
    const token = token0Quote ? event.token1 : event.token0;
    const pairedWith = token0Quote ? event.token0 : event.token1;
    const existing = launchMap.get(token);
    if (existing) {
      existing.poolCount += 1;
      existing.firstBlock = Math.min(existing.firstBlock, event.blockNumber);
      if (event.blockNumber >= existing.lastBlock) {
        existing.lastBlock = event.blockNumber;
        existing.pool = event.pool;
        existing.dex = event.dex;
        existing.pairedWith = pairedWith;
      }
    } else {
      launchMap.set(token, {
        token,
        pairedWith,
        pool: event.pool,
        dex: event.dex,
        poolCount: 1,
        firstBlock: event.blockNumber,
        lastBlock: event.blockNumber,
      });
    }
  }

  const freshFirst = [...launchMap.values()].sort((a, b) => b.lastBlock - a.lastBlock);
  const marketByToken = await batchDexPairs(
    freshFirst.slice(0, MARKET_CHECK_LIMIT).map((l) => l.token)
  );

  const scoreLaunch = (l: (typeof freshFirst)[number], market: TokenRiskScan["market"]) => {
    let score = 10; // it produced a real DEX pool
    if (market) {
      score += Math.min(40, Math.floor((market.liquidityUsd ?? 0) / 2_500));
      score += Math.min(30, Math.floor((market.volume24h ?? 0) / 10_000));
      if (((market.buys5m ?? 0) + (market.sells5m ?? 0)) >= 10) score += 10;
    }
    return Math.min(100, score);
  };
  const ranked = freshFirst
    .map((l) => ({ ...l, market: marketByToken.get(l.token) ?? null }))
    // An established token (USDG, majors) getting a fresh pool is liquidity
    // ops, not a launch — its best DexScreener pair long predates the window.
    .filter(
      (l) =>
        !l.market?.pairCreatedAt ||
        Date.parse(l.market.pairCreatedAt) >= Date.now() - RADAR_WINDOW_MINUTES * 2 * 60_000
    )
    .sort(
      (a, b) =>
        scoreLaunch(b, b.market) - scoreLaunch(a, a.market) || b.lastBlock - a.lastBlock
    );

  // Enrich the head of the list on-chain, sequentially — bursts trip the RPC limit.
  const quoteMeta = new Map<string, { symbol: string | null; decimals: number }>();
  const launches: RadarLaunch[] = [];
  for (const candidate of ranked.slice(0, ENRICH_LIMIT)) {
    const token = await tokenMetadata(candidate.token);
    let quote = quoteMeta.get(candidate.pairedWith);
    if (!quote) {
      const meta = await tokenMetadata(candidate.pairedWith);
      quote = { symbol: meta?.symbol ?? null, decimals: meta?.decimals ?? 18 };
      quoteMeta.set(candidate.pairedWith, quote);
    }
    const onChainDepthUsd = candidate.market
      ? null
      : await poolQuoteDepthUsd(
          candidate.pool,
          candidate.pairedWith,
          quote.decimals,
          quote.symbol?.toUpperCase() === "WETH"
        );
    launches.push({
      token: candidate.token,
      name: token?.name ?? null,
      symbol: token?.symbol ?? null,
      pairedWith: candidate.pairedWith,
      pairedSymbol: quote.symbol,
      pool: candidate.pool,
      dex: candidate.dex,
      poolCount: candidate.poolCount,
      firstBlock: candidate.firstBlock,
      lastBlock: candidate.lastBlock,
      ageMinutes:
        tsLatest !== null
          ? Math.max(0, Math.round((latestBlock - candidate.firstBlock) / blocksPerSecond / 60))
          : null,
      market: candidate.market,
      onChainDepthUsd,
      score: scoreLaunch(candidate, candidate.market),
    });
  }

  // Chain market leaders: the quote token's top pairs are a de-facto
  // leaderboard for the whole chain on DexScreener.
  let marketLeaders: { symbol: string | null; token: string; priceUsd: number | null; liquidityUsd: number | null; volume24h: number | null; url: string }[] = [];
  const topQuote = [...tokenFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topQuote) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${topQuote}`, {
        headers: { "User-Agent": "bowyer-meme-radar" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        const body = (await res.json()) as { pairs?: (DexPair & { baseToken?: { address?: string; symbol?: string } })[] };
        marketLeaders = (body.pairs ?? [])
          .filter((p) => p.chainId === DEXSCREENER_CHAIN_ID && p.baseToken?.address)
          .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
          .slice(0, 5)
          .map((p) => ({
            symbol: p.baseToken?.symbol ?? null,
            token: p.baseToken!.address!.toLowerCase(),
            priceUsd: Number.isFinite(Number(p.priceUsd)) ? Number(p.priceUsd) : null,
            liquidityUsd: typeof p.liquidity?.usd === "number" ? p.liquidity.usd : null,
            volume24h: typeof p.volume?.h24 === "number" ? p.volume.h24 : null,
            url: p.url ?? "",
          }));
      }
    } catch {
      // Leaderboard is optional context.
    }
  }

  /* ---- legacy: direct EOA deployments from the narrow block scan ---- */

  // Enrich sequentially — a parallel burst of receipt/metadata calls trips the RPC rate limit.
  const launchCandidates: RadarCandidate[] = [];
  for (const deployment of chain.contractDeployments.slice(0, ENRICH_LIMIT)) {
    const contractAddress = await contractAddressFor(deployment.txHash);
    const [token, market] = contractAddress
      ? await Promise.all([tokenMetadata(contractAddress), getDexPair(contractAddress)])
      : [null, null];
    // Heat score earned by evidence only — an unidentified contract with no
    // metadata and no pool scores ~0 instead of a misleading baseline.
    let score = 0;
    if (token?.symbol || token?.name) score += 25;
    if (deployment.valueEth >= 0.5) score += 15;
    if (market) score += 20 + Math.min(20, Math.floor((market.liquidityUsd ?? 0) / 5_000));
    launchCandidates.push({
      ...deployment,
      contractAddress,
      token,
      market,
      lifecycle: market ? ("trading" as const) : ("forming" as const),
      score: Math.min(100, score),
    });
  }

  const clusters = chain.fundingClusters.map((cluster) => ({
    ...cluster,
    lifecycle: "coordinated-funding" as const,
    // ETH-weighted: a faucet fanning out dust to many addresses stays cold.
    score: Math.min(
      100,
      Math.round(Math.min(cluster.recipients * 6, 40) + Math.min(cluster.totalEth * 10, 45) + (cluster.totalEth >= 5 ? 15 : 0))
    ),
  }));

  // Significance split — only these are worth a reader's attention. Everything
  // else is routine chain traffic (infra deploys, batch payouts, faucets).
  const notableCandidates = launchCandidates.filter(
    (c) => c.token?.name || c.token?.symbol || c.market || c.valueEth >= 0.25
  );
  const notableClusters = clusters.filter((c) => c.totalEth >= 1 && c.recipients >= 5);
  const routineDeployments = launchCandidates.length - notableCandidates.length;
  const routineClusters = clusters.length - notableClusters.length;

  const notableLaunches = launches.filter(
    (l) =>
      (l.market && ((l.market.liquidityUsd ?? 0) >= 2_000 || (l.market.volume24h ?? 0) >= 5_000)) ||
      (l.onChainDepthUsd ?? 0) >= 2_000
  );
  const launchesPerHour =
    RADAR_WINDOW_MINUTES > 0 ? Math.round((launchMap.size / RADAR_WINDOW_MINUTES) * 60) : 0;

  const level: "hot" | "warm" | "quiet" =
    notableLaunches.some(
      (l) => (l.market?.liquidityUsd ?? 0) >= 10_000 || (l.market?.volume24h ?? 0) >= 25_000
    ) || notableClusters.length > 0
      ? "hot"
      : notableLaunches.length > 0 || launchMap.size > 0 || notableCandidates.length > 0
        ? "warm"
        : "quiet";

  const headlineBits: string[] = [];
  if (launchMap.size > 0) {
    headlineBits.push(
      `${launchMap.size} token launch${launchMap.size === 1 ? "" : "es"} via new DEX pools in the last ${RADAR_WINDOW_MINUTES} min (≈${launchesPerHour}/hr)${notableLaunches.length > 0 ? `; ${notableLaunches.length} with real liquidity or volume` : "; none with meaningful liquidity yet"}`
    );
  } else {
    headlineBits.push(
      `No new DEX pools in the last ${RADAR_WINDOW_MINUTES} min`
    );
  }
  if (notableClusters.length > 0) {
    headlineBits.push(
      `${notableClusters.length} funding fan-out${notableClusters.length === 1 ? "" : "s"} moving ≥1 ETH`
    );
  }
  if (level === "quiet") {
    headlineBits.push("nothing above the noise floor");
  }

  return {
    chainId: chain.chainId,
    scannedAt: chain.scannedAt,
    blockRange: {
      from: fromBlock,
      to: latestBlock,
      blocksScanned: latestBlock - fromBlock + 1,
      windowMinutes: RADAR_WINDOW_MINUTES,
      blocksPerSecond: Math.round(blocksPerSecond * 10) / 10,
    },
    methodology:
      "Launch detection via Uniswap v2/v3 pool-creation events over a time-calibrated block window (factories and launchpads included), enriched with token metadata (eth_call), DexScreener market data, and on-chain pool depth for pools not yet indexed. Direct EOA deployments and native-transfer fan-outs from a short recent window. No price prediction or trade execution.",
    signal: {
      level,
      headline: headlineBits.join("; "),
      poolsCreated: poolEvents.length,
      uniqueLaunches: launchMap.size,
      launchesPerHour,
      routineDeployments,
      routineClusters,
    },
    launches,
    notableLaunches,
    marketLeaders,
    launchCandidates: launchCandidates.sort((a, b) => b.score - a.score),
    notableCandidates: notableCandidates.sort((a, b) => b.score - a.score),
    clusters,
    notableClusters,
    unavailableChecks: [
      "Dev-wallet sell tracing is not available. Use scan_token on a specific address for holder distribution and contract-level risk flags.",
    ],
  };
}
