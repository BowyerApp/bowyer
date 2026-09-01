/**
 * fomo wallet — direct Solana execution.
 *
 * fomo accounts are non-custodial Privy embedded wallets. fomo's own API is
 * gated by a Privy session that rotates every ~15 min and cannot be minted
 * headlessly (wallet login is disabled on their Privy app), so it is unusable
 * for an unattended bot. Instead we trade the wallet DIRECTLY on-chain with the
 * embedded key: fomo's portfolio is just a view over the wallet's on-chain
 * balances, so every fill here shows up in the app automatically.
 *
 * Execution is Jupiter ULTRA (order -> sign -> execute): Ultra returns a
 * transaction where JUPITER's relayer is the fee-payer (gasless: true), the
 * wallet only signs its own taker slot, and Ultra submits + lands the tx
 * itself. This means the wallet needs ZERO SOL — ever. Signing uses the same
 * raw ed25519 method proven byte-for-byte against fomo's own swap
 * transactions (see the HAR verification): deserialize the
 * VersionedTransaction, fill every signature slot whose account key is ours,
 * re-serialize.
 *
 * The legacy quote/swap/RPC-submit path is kept as a fallback, but it requires
 * the wallet to hold SOL for fees, so Ultra is always preferred.
 */

import bs58 from "bs58";
import nacl from "tweetnacl";
import type { ScreenerToken } from "@/lib/market-data";
import { kvGet, kvSet } from "@/lib/trading/store";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_DECIMALS = 6;

/** fomo trades USDC as base; never let the bot "trade" a stablecoin into itself. */
const STABLE_MINTS = new Set<string>([
  USDC_MINT,
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX", // USDH
]);

const JUP_BASE = process.env.JUPITER_API_BASE?.trim() || "https://api.jup.ag/swap/v1";
const ULTRA_BASE = process.env.JUPITER_ULTRA_BASE?.trim() || "https://api.jup.ag/ultra/v1";
const SOLANA_RPC = process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";

interface SolanaWallet {
  secretKey: Uint8Array; // 64-byte ed25519 secret key
  publicKey: Uint8Array; // 32-byte
  address: string; // base58
}

/** Load the embedded Solana wallet from a base58 secret key (env-provided). */
export function loadFomoSolanaWallet(): SolanaWallet | null {
  const b58 = process.env.FOMO_SOLANA_KEY?.trim();
  if (!b58) return null;
  const secretKey = bs58.decode(b58);
  if (secretKey.length !== 64) throw new Error("FOMO_SOLANA_KEY must be a 64-byte base58 secret key");
  const publicKey = secretKey.slice(32, 64);
  return { secretKey, publicKey, address: bs58.encode(publicKey) };
}

export function fomoSolanaEnabled(): boolean {
  return Boolean(process.env.FOMO_SOLANA_KEY?.trim());
}

/** External signer (e.g. a per-agent encrypted wallet) usable for swaps. */
export interface SolanaSigner {
  /** 64-byte ed25519 secret key. */
  secretKey: Uint8Array;
  address: string;
}

function signerToWallet(s: SolanaSigner): SolanaWallet {
  if (s.secretKey.length !== 64) throw new Error("Solana signer must be a 64-byte secret key");
  return { secretKey: s.secretKey, publicKey: s.secretKey.slice(32, 64), address: s.address };
}

export interface JupQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: unknown[];
  [k: string]: unknown;
}

/** Quote a swap. amount is in the input mint's smallest units. */
export async function jupQuote(
  inputMint: string,
  outputMint: string,
  amount: string | number,
  slippageBps = 100
): Promise<JupQuote> {
  const url = `${JUP_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`jupiter quote ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const q = (await res.json()) as JupQuote;
  if (!q.outAmount) throw new Error("jupiter quote: no route");
  return q;
}

/** Build the swap transaction (base64) for a quote. */
async function jupSwapTx(quote: JupQuote, userPublicKey: string): Promise<string> {
  const res = await fetch(`${JUP_BASE}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`jupiter swap ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as { swapTransaction?: string };
  if (!json.swapTransaction) throw new Error("jupiter swap: no transaction returned");
  return json.swapTransaction;
}

/**
 * Sign a base64 (legacy or v0) transaction: fill every signature slot whose
 * account key equals the wallet's pubkey. Proven against fomo's own txs.
 */
export function signSolanaTx(base64Tx: string, wallet: SolanaWallet): string {
  const raw = Buffer.from(base64Tx, "base64");
  const numSigs = raw[0];
  const sigStart = 1;
  const msgStart = 1 + numSigs * 64;
  const message = raw.subarray(msgStart);

  // Parse account keys to map signer slot -> pubkey.
  let p = 0;
  const versioned = (message[0] & 0x80) !== 0;
  if (versioned) p += 1;
  const numRequiredSignatures = message[p];
  p += 3; // reqSig, roSigned, roUnsigned
  const [acctCount, bytesRead] = readCompactU16(message, p);
  p += bytesRead;

  const signature = nacl.sign.detached(message, wallet.secretKey);
  const signed = Buffer.from(raw);
  let filled = 0;
  for (let i = 0; i < numRequiredSignatures; i++) {
    const key = message.subarray(p + i * 32, p + i * 32 + 32);
    if (Buffer.from(key).equals(Buffer.from(wallet.publicKey))) {
      Buffer.from(signature).copy(signed, sigStart + i * 64);
      filled++;
    }
  }
  if (filled === 0) throw new Error("wallet is not a required signer on this transaction");
  void acctCount;
  return signed.toString("base64");
}

/** Solana compact-u16 (shortvec) decoder. */
function readCompactU16(buf: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let bytes = 0;
  for (;;) {
    const byte = buf[offset + bytes];
    value |= (byte & 0x7f) << (bytes * 7);
    bytes++;
    if ((byte & 0x80) === 0) break;
  }
  return [value, bytes];
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(`solana rpc ${method}: ${json.error.message}`);
  return json.result as T;
}

/** Submit a signed base64 transaction and wait for confirmation. */
export async function submitSolanaTx(signedBase64: string): Promise<string> {
  const txid = await rpc<string>("sendTransaction", [
    signedBase64,
    { encoding: "base64", skipPreflight: false, maxRetries: 3 },
  ]);
  // Poll for confirmation (~30s budget).
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await rpc<{ value: ({ confirmationStatus?: string; err?: unknown } | null)[] }>(
      "getSignatureStatuses",
      [[txid]]
    ).catch(() => null);
    const s = st?.value?.[0];
    if (s?.err) throw new Error(`tx ${txid} failed on-chain: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return txid;
  }
  return txid; // submitted; confirmation still pending
}

/** SOL balance (lamports -> SOL) for the wallet. */
export async function solBalance(address: string): Promise<number> {
  const r = await rpc<{ value: number }>("getBalance", [address]);
  return (r?.value ?? 0) / 1e9;
}

/** SPL token balance (ui amount) for a mint owned by the wallet. */
export async function splBalance(address: string, mint: string): Promise<number> {
  const r = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }[] }>(
    "getTokenAccountsByOwner",
    [address, { mint }, { encoding: "jsonParsed" }]
  );
  return r?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
}

export interface FomoSwapResult {
  txid: string;
  inAmount: string;
  outAmount: string;
  gasless: boolean;
}

interface UltraOrder {
  requestId: string;
  transaction: string | null;
  gasless?: boolean;
  swapType?: string;
  router?: string;
  inAmount?: string;
  outAmount?: string;
  errorMessage?: string;
}

/** Fetch a gasless Ultra order (Jupiter relayer pays fees). Retries transient empty-tx responses. */
async function ultraOrder(
  inputMint: string,
  outputMint: string,
  amountRaw: string | number,
  taker: string
): Promise<UltraOrder> {
  const url = `${ULTRA_BASE}/order?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&taker=${taker}`;
  let last: UltraOrder | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`ultra order ${res.status}: ${(await res.text()).slice(0, 160)}`);
    last = (await res.json()) as UltraOrder;
    if (last.transaction) return last;
    // Route sometimes needs a beat to materialize — brief pause and retry.
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error(`ultra order: no transaction (${last?.errorMessage ?? "no route"})`);
}

/** Hand the taker-signed transaction back to Ultra; Jupiter co-signs as fee-payer and lands it. */
async function ultraExecute(signedBase64: string, requestId: string): Promise<string> {
  const res = await fetch(`${ULTRA_BASE}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedTransaction: signedBase64, requestId }),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json()) as {
    status?: string;
    signature?: string;
    error?: string;
    code?: number;
  };
  if (json.status !== "Success" || !json.signature) {
    throw new Error(`ultra execute failed: ${json.error ?? json.status ?? res.status}`);
  }
  return json.signature;
}

/**
 * Full swap via Jupiter Ultra: order -> sign taker slot -> execute.
 * GASLESS — the wallet needs zero SOL; Jupiter's relayer pays fees.
 * amountRaw is in the input mint's smallest units.
 */
export async function fomoSolanaSwap(input: {
  inputMint: string;
  outputMint: string;
  amountRaw: string | number;
  slippageBps?: number;
  /** Sign with this wallet instead of the env-configured house wallet. */
  signer?: SolanaSigner;
}): Promise<FomoSwapResult> {
  const wallet = input.signer ? signerToWallet(input.signer) : loadFomoSolanaWallet();
  if (!wallet) throw new Error("FOMO_SOLANA_KEY not configured");
  const order = await ultraOrder(input.inputMint, input.outputMint, input.amountRaw, wallet.address);
  const signed = signSolanaTx(order.transaction as string, wallet);
  const txid = await ultraExecute(signed, order.requestId);
  return {
    txid,
    inAmount: order.inAmount ?? String(input.amountRaw),
    outAmount: order.outAmount ?? "0",
    gasless: order.gasless !== false,
  };
}

/**
 * Legacy path (requires the wallet to hold SOL for fees): quote -> build ->
 * sign -> RPC submit. Kept as an explicit fallback only.
 */
export async function fomoSolanaSwapLegacy(input: {
  inputMint: string;
  outputMint: string;
  amountRaw: string | number;
  slippageBps?: number;
}): Promise<FomoSwapResult> {
  const wallet = loadFomoSolanaWallet();
  if (!wallet) throw new Error("FOMO_SOLANA_KEY not configured");
  const quote = await jupQuote(input.inputMint, input.outputMint, input.amountRaw, input.slippageBps ?? 100);
  const txb64 = await jupSwapTx(quote, wallet.address);
  const signed = signSolanaTx(txb64, wallet);
  const txid = await submitSolanaTx(signed);
  return { txid, inAmount: quote.inAmount, outAmount: quote.outAmount, gasless: false };
}

/** Base58 address of the configured fomo wallet, or null if unset. */
export function fomoSolanaAddress(): string | null {
  return loadFomoSolanaWallet()?.address ?? null;
}

/* ---------------- USDC withdrawal (owner exit path) ---------------- */

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** Solana compact-u16 (shortvec) encoder. */
function writeCompactU16(value: number): number[] {
  const out: number[] = [];
  let v = value;
  for (;;) {
    let byte = v & 0x7f;
    v >>= 7;
    if (v > 0) byte |= 0x80;
    out.push(byte);
    if (v === 0) return out;
  }
}

async function usdcTokenAccount(
  owner: string
): Promise<{ pubkey: string; amountRaw: bigint; uiAmount: number } | null> {
  const r = await rpc<{
    value: {
      pubkey: string;
      account: { data: { parsed: { info: { tokenAmount: { amount: string; uiAmount: number } } } } };
    }[];
  }>("getTokenAccountsByOwner", [owner, { mint: USDC_MINT }, { encoding: "jsonParsed" }]);
  const acc = r?.value?.[0];
  if (!acc) return null;
  const t = acc.account.data.parsed.info.tokenAmount;
  return { pubkey: acc.pubkey, amountRaw: BigInt(t.amount), uiAmount: t.uiAmount ?? 0 };
}

/**
 * Transfer the wallet's ENTIRE USDC balance to `to`. Builds a raw legacy
 * transaction (no web3.js dependency) with a single SPL Transfer instruction,
 * signed with the same ed25519 path proven on Jupiter swaps.
 *
 * Constraints, surfaced as clear errors:
 * - the destination must already have a USDC token account (i.e. has held
 *   USDC at least once) — we intentionally don't create accounts for it;
 * - the agent wallet needs a dust of SOL (~0.0001) for the network fee,
 *   since only Jupiter swaps are relayer-paid.
 */
export async function withdrawUsdcSolana(
  signer: SolanaSigner,
  to: string
): Promise<{ txid: string; amountUsd: number }> {
  const { tx, amountUsd } = await buildUsdcWithdrawTx(signer, to);
  const txid = await submitSolanaTx(tx);
  return { txid, amountUsd };
}

/** Build + sign the withdrawal transaction (exposed separately for simulation tests). */
export async function buildUsdcWithdrawTx(
  signer: SolanaSigner,
  to: string
): Promise<{ tx: string; amountUsd: number }> {
  const toBytes = bs58.decode(to);
  if (toBytes.length !== 32) throw new Error("destination must be a Solana address");

  const src = await usdcTokenAccount(signer.address);
  if (!src || src.amountRaw <= BigInt(0)) throw new Error("no USDC to withdraw");
  const dst = await usdcTokenAccount(to);
  if (!dst) {
    throw new Error(
      "destination wallet has no USDC token account yet — it must hold (or have once held) USDC"
    );
  }
  const sol = await solBalance(signer.address);
  if (sol < 0.00001) {
    throw new Error(
      `agent wallet needs a dust of SOL for the withdrawal network fee — send ~0.0005 SOL to ${signer.address} and retry`
    );
  }

  const { value } = await rpc<{ value: { blockhash: string } }>("getLatestBlockhash", [
    { commitment: "finalized" },
  ]);

  const wallet = signerToWallet(signer);
  const keys = [wallet.publicKey, bs58.decode(src.pubkey), bs58.decode(dst.pubkey), bs58.decode(TOKEN_PROGRAM)];

  // SPL Token Transfer: tag 3 + u64 LE amount.
  const data = Buffer.alloc(9);
  data[0] = 3;
  data.writeBigUInt64LE(src.amountRaw, 1);

  const message = Buffer.concat([
    Buffer.from([1, 0, 1]), // 1 required signature, 0 ro-signed, 1 ro-unsigned (token program)
    Buffer.from(writeCompactU16(keys.length)),
    ...keys.map((k) => Buffer.from(k)),
    Buffer.from(bs58.decode(value.blockhash)),
    Buffer.from(writeCompactU16(1)), // one instruction
    Buffer.from([3]), // program id index (token program)
    Buffer.from(writeCompactU16(3)),
    Buffer.from([1, 2, 0]), // src ata, dst ata, owner (signer)
    Buffer.from(writeCompactU16(data.length)),
    data,
  ]);

  const signature = nacl.sign.detached(message, wallet.secretKey);
  const tx = Buffer.concat([Buffer.from(writeCompactU16(1)), Buffer.from(signature), message]);
  return { tx: tx.toString("base64"), amountUsd: src.uiAmount };
}

/* ---------------- Solana screener (Jupiter Token API v2) ---------------- */

const JUP_TOKENS_BASE = process.env.JUPITER_TOKENS_BASE?.trim() || "https://lite-api.jup.ag/tokens/v2";

interface JupTokenStats {
  priceChange?: number; // already a percentage
  buyVolume?: number;
  sellVolume?: number;
  numBuys?: number;
  numSells?: number;
}

interface JupToken {
  id: string; // mint
  name?: string;
  symbol?: string;
  icon?: string;
  decimals?: number;
  holderCount?: number;
  mcap?: number;
  fdv?: number;
  usdPrice?: number;
  liquidity?: number;
  stats5m?: JupTokenStats;
  stats1h?: JupTokenStats;
  stats24h?: JupTokenStats;
  firstPool?: { createdAt?: string };
}

const decimalsCache = new Map<string, number>();

/**
 * lowercase -> proper-case mint. The trading store lowercases token keys (an
 * EVM convention), but Solana mints are case-sensitive base58 — an exit order
 * built from a stored position would hand the RPC and Jupiter a mint that
 * either isn't valid base58 or points at a nonexistent account, making the
 * position impossible to close. Every screener refresh records the true case
 * here, persisted so exits survive restarts and tokens that fall off the list.
 */
const KV_MINT_CASE = "fomo_mint_case";
const MINT_CASE_MAX = 2000;
let mintCase: Map<string, string> | null = null;
let mintCaseDirty = false;
let mintCasePersistedAt = 0;

function mintCaseMap(): Map<string, string> {
  if (!mintCase) {
    mintCase = new Map();
    try {
      const raw = kvGet(KV_MINT_CASE);
      if (raw) {
        for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) {
          mintCase.set(k, v);
        }
      }
    } catch {
      /* start empty — repopulates from the screener within a minute */
    }
  }
  return mintCase;
}

function rememberMintCase(mint: string): void {
  const map = mintCaseMap();
  const key = mint.toLowerCase();
  if (map.get(key) === mint) return;
  map.set(key, mint);
  while (map.size > MINT_CASE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  mintCaseDirty = true;
}

function persistMintCase(): void {
  if (!mintCaseDirty || Date.now() - mintCasePersistedAt < 60_000) return;
  try {
    kvSet(KV_MINT_CASE, JSON.stringify(Object.fromEntries(mintCaseMap())));
    mintCaseDirty = false;
    mintCasePersistedAt = Date.now();
  } catch {
    /* retry on the next refresh */
  }
}

/** Recover the case-sensitive mint for a (possibly lowercased) stored token. */
export function canonicalMint(mint: string): string {
  return mintCaseMap().get(mint.toLowerCase()) ?? mint;
}

/** SPL mint decimals (cached; sourced from the screener or RPC getTokenSupply). */
export async function tokenDecimalsSolana(mint: string): Promise<number> {
  if (mint.toLowerCase() === USDC_MINT.toLowerCase()) return USDC_DECIMALS;
  const hit = decimalsCache.get(mint.toLowerCase());
  if (hit !== undefined) return hit;
  const r = await rpc<{ value: { decimals: number } }>("getTokenSupply", [canonicalMint(mint)]);
  const d = r?.value?.decimals ?? 9;
  decimalsCache.set(mint.toLowerCase(), d);
  return d;
}

function toScreenerToken(t: JupToken): ScreenerToken | null {
  if (!t.id || STABLE_MINTS.has(t.id)) return null;
  const price = t.usdPrice ?? null;
  if (!price || price <= 0) return null;
  rememberMintCase(t.id);
  if (t.decimals !== undefined) decimalsCache.set(t.id.toLowerCase(), t.decimals);
  const s24 = t.stats24h ?? {};
  const vol24 = (s24.buyVolume ?? 0) + (s24.sellVolume ?? 0);
  const created = t.firstPool?.createdAt ? Date.parse(t.firstPool.createdAt) : NaN;
  const ageMinutes = Number.isFinite(created) ? Math.max(0, Math.round((Date.now() - created) / 60_000)) : null;
  return {
    address: t.id,
    name: t.name ?? t.symbol ?? t.id.slice(0, 6),
    symbol: t.symbol ?? "?",
    imageUrl: t.icon ?? null,
    priceUsd: price,
    change5m: t.stats5m?.priceChange ?? null,
    change1h: t.stats1h?.priceChange ?? null,
    change24h: s24.priceChange ?? null,
    mcap: t.mcap ?? t.fdv ?? null,
    liquidityUsd: t.liquidity ?? null,
    volume24h: vol24 || null,
    buys24h: s24.numBuys ?? null,
    sells24h: s24.numSells ?? null,
    holders: t.holderCount ?? null,
    ageMinutes,
    pairAddress: null,
    dexId: "jupiter",
    dexUrl: `https://jup.ag/tokens/${t.id}`,
    website: null,
    twitter: null,
    explorerUrl: `https://solscan.io/token/${t.id}`,
    agent: null,
    riskLevel: null,
    riskScore: null,
    top10Pct: null,
    riskFlags: [],
    spark: [],
    fresh: false,
    kind: "meme",
  };
}

async function fetchJupList(path: string): Promise<JupToken[]> {
  const res = await fetch(`${JUP_TOKENS_BASE}/${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`jupiter tokens ${res.status}`);
  return (await res.json()) as JupToken[];
}

/**
 * Price specific held tokens that fell off the screener. The names that dump
 * hardest are exactly the ones that drop out of the top-traded lists — if they
 * become invisible, stop-losses silently never fire and the analyst sees the
 * position as break-even. Searches by exact mint, falling back to symbol
 * search matched case-insensitively (which also re-learns the true mint case
 * for positions recorded before case tracking existed).
 */
export async function solTokensByMint(
  wanted: { mint: string; symbol?: string }[]
): Promise<ScreenerToken[]> {
  const out: ScreenerToken[] = [];
  for (const w of wanted.slice(0, 8)) {
    try {
      const queries = [canonicalMint(w.mint), ...(w.symbol ? [w.symbol] : [])];
      let hit: JupToken | undefined;
      for (const q of queries) {
        const res = await fetch(`${JUP_TOKENS_BASE}/search?query=${encodeURIComponent(q)}`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        const list = (await res.json()) as JupToken[];
        hit = list.find((t) => t.id?.toLowerCase() === w.mint.toLowerCase());
        if (hit) break;
      }
      const row = hit ? toScreenerToken(hit) : null;
      if (row) out.push(row);
    } catch {
      /* unpriced this tick — the next tick retries */
    }
  }
  if (out.length > 0) persistMintCase();
  return out;
}

const SOL_SCREENER_FRESH_MS = 45_000;
const SOL_SCREENER_STALE_MS = 15 * 60_000;
let solScreenerCache: { rows: ScreenerToken[]; at: number } | null = null;
let solScreenerInflight: Promise<ScreenerToken[]> | null = null;

/**
 * Solana token universe shaped as ScreenerTokens so the Signal Analyst prompt,
 * strategies, and paper execution work unchanged. Merges Jupiter's top-traded
 * and top-organic-score lists (24h), filters out stables, and requires a
 * minimum of liquidity so the bot never picks an untradeable ghost.
 *
 * Cached 45s fresh / 15 min stale — same shape as the Hyperliquid screener,
 * because Railway's shared egress can get rate-limited under load.
 */
export async function solScreener(limit = 40): Promise<ScreenerToken[]> {
  const now = Date.now();
  if (solScreenerCache && now - solScreenerCache.at < SOL_SCREENER_FRESH_MS) {
    return solScreenerCache.rows.slice(0, limit);
  }
  if (!solScreenerInflight) {
    solScreenerInflight = (async () => {
      const [traded, organic] = await Promise.all([
        fetchJupList("toptraded/24h?limit=60").catch(() => [] as JupToken[]),
        fetchJupList("toporganicscore/24h?limit=60").catch(() => [] as JupToken[]),
      ]);
      const seen = new Set<string>();
      const rows: ScreenerToken[] = [];
      for (const t of [...organic, ...traded]) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        const row = toScreenerToken(t);
        if (row && (row.liquidityUsd ?? 0) >= 25_000) rows.push(row);
      }
      persistMintCase();
      return rows.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    })().finally(() => {
      solScreenerInflight = null;
    });
  }
  try {
    const rows = await solScreenerInflight;
    solScreenerCache = { rows, at: Date.now() };
    return rows.slice(0, limit);
  } catch (err) {
    if (solScreenerCache && now - solScreenerCache.at < SOL_SCREENER_STALE_MS) {
      return solScreenerCache.rows.slice(0, limit);
    }
    throw err;
  }
}
