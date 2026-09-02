import "server-only";
import type { PrivateKeyAccount } from "viem";
import { USDG } from "@/lib/trading/dex";
import type { SolanaSigner } from "@/lib/trading/fomo-solana";

/**
 * Cross-chain execution via Relay — the same router fomo itself uses.
 *
 * The design mirrors the fomo app: ONE cash balance (USDC on the agent's
 * Solana wallet) funds trades on every chain. A Robinhood Chain buy is a
 * single Solana signature (Relay's solver swaps and delivers the token to the
 * agent's EVM wallet); a sell executes approve+deposit on RHC and the USDC
 * lands straight back on the Solana balance. No idle capital parked per chain.
 *
 * Relay returns raw Solana instructions plus address lookup tables for SVM
 * origins, so the v0 transaction is compiled with @solana/web3.js
 * (dynamically imported — only ever loaded on the node runtime).
 */

const RELAY_API = "https://api.relay.link";
const SOLANA_CHAIN_ID = 792703809;
const RHC_CHAIN_ID = 4663;
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NATIVE_ETH = "0x0000000000000000000000000000000000000000";

/**
 * Reject buys routed through a pool too thin to absorb the clip. Guarded on
 * Relay's swapImpact (pure pool impact) — NOT totalImpact, which folds in
 * ~fixed cross-chain fees (gas + relayer) that read as a huge percentage on
 * small clips and were rejecting $25 buys into multi-million-dollar pools.
 */
const MAX_BUY_SWAP_IMPACT_PCT = 8;
/** Catastrophic sanity cap on total value lost (fees + impact combined). */
const MAX_BUY_TOTAL_IMPACT_PCT = 25;

interface RelayInstructionKey {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface RelayInstruction {
  keys: RelayInstructionKey[];
  programId: string;
  data: string; // hex
}

interface RelayEvmTx {
  from: string;
  to: string;
  data: string;
  value?: string;
}

interface RelayQuote {
  steps: {
    id: string;
    kind: string;
    items: {
      data: {
        instructions?: RelayInstruction[];
        addressLookupTableAddresses?: string[];
      } & Partial<RelayEvmTx>;
      check?: { endpoint: string };
    }[];
  }[];
  details?: {
    currencyOut?: {
      amount?: string;
      amountUsd?: string;
      amountFormatted?: string;
      currency?: { decimals?: number; symbol?: string };
    };
    totalImpact?: { percent?: string };
    swapImpact?: { percent?: string };
  };
}

export interface RelayTradeResult {
  txid: string;
  /** Expected output in raw units of the destination currency. */
  outRaw: string;
  outUsd: number;
  outDecimals: number | null;
  impactPercent: string;
  checkEndpoint: string | null;
}

async function relayQuote(body: Record<string, unknown>): Promise<RelayQuote> {
  const res = await fetch(`${RELAY_API}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`relay quote ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as RelayQuote;
}

function quoteResult(quote: RelayQuote, txid: string): RelayTradeResult {
  const out = quote.details?.currencyOut;
  const item = quote.steps?.[0]?.items?.[0];
  return {
    txid,
    outRaw: out?.amount ?? "0",
    outUsd: Number(out?.amountUsd ?? 0),
    outDecimals: out?.currency?.decimals ?? null,
    impactPercent: String(quote.details?.totalImpact?.percent ?? "?"),
    checkEndpoint: item?.check?.endpoint ? `${RELAY_API}${item.check.endpoint}` : null,
  };
}

/** Compile, sign and send a Solana-origin Relay step. Returns the tx signature. */
async function executeSolanaStep(signer: SolanaSigner, quote: RelayQuote): Promise<string> {
  const item = quote.steps?.[0]?.items?.[0];
  const ixs = item?.data?.instructions;
  if (!ixs?.length) throw new Error("relay quote returned no Solana instructions");

  const web3 = await import("@solana/web3.js");
  const connection = new web3.Connection(
    process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
  const keypair = web3.Keypair.fromSecretKey(signer.secretKey);

  const instructions = ixs.map(
    (ix) =>
      new web3.TransactionInstruction({
        programId: new web3.PublicKey(ix.programId),
        keys: ix.keys.map((k) => ({
          pubkey: new web3.PublicKey(k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: Buffer.from(ix.data.replace(/^0x/, ""), "hex"),
      })
  );

  const lookupTables: import("@solana/web3.js").AddressLookupTableAccount[] = [];
  for (const alt of item.data.addressLookupTableAddresses ?? []) {
    const acc = await connection.getAddressLookupTable(new web3.PublicKey(alt));
    if (acc.value) lookupTables.push(acc.value);
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
  const message = new web3.TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lookupTables);
  const tx = new web3.VersionedTransaction(message);
  tx.sign([keypair]);

  const txid = await connection.sendTransaction(tx, { maxRetries: 3 });
  await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, "confirmed");
  return txid;
}

/** Poll a Relay intent until the solver reports success (or time out). */
async function awaitRelayFill(checkEndpoint: string | null, budgetMs = 90_000): Promise<void> {
  if (!checkEndpoint) return;
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(checkEndpoint, { signal: AbortSignal.timeout(10_000) });
      const json = (await res.json()) as { status?: string };
      if (json.status === "success") return;
      if (json.status === "failure" || json.status === "refund") {
        throw new Error(`relay fill ${json.status}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("relay fill")) throw err;
      /* transient status errors — keep polling */
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  // Solver almost always fills in seconds; a timeout here is exceptional but
  // the origin tx is already final, so surface it rather than double-spend.
  throw new Error("relay fill unconfirmed after 90s — check the intent status before retrying");
}

/**
 * Buy a Robinhood Chain token with USDC from the agent's SOLANA balance.
 * One Solana signature; the token is delivered to the agent's EVM wallet.
 */
export async function relayBuyRhcToken(input: {
  signer: SolanaSigner;
  /** Agent EVM wallet that will hold the RHC token. */
  recipient: string;
  usd: number;
  /** RHC token address (0x…). */
  token: string;
}): Promise<RelayTradeResult> {
  const quote = await relayQuote({
    user: input.signer.address,
    recipient: input.recipient,
    originChainId: SOLANA_CHAIN_ID,
    destinationChainId: RHC_CHAIN_ID,
    originCurrency: USDC_MINT,
    destinationCurrency: input.token,
    amount: String(Math.round(input.usd * 1e6)),
    tradeType: "EXACT_INPUT",
  });
  const swapImpact = Number(quote.details?.swapImpact?.percent ?? 0);
  if (Number.isFinite(swapImpact) && swapImpact < -MAX_BUY_SWAP_IMPACT_PCT) {
    throw new Error(
      `relay swap impact ${swapImpact}% exceeds ${MAX_BUY_SWAP_IMPACT_PCT}% buy cap — pool too thin for this clip`
    );
  }
  const totalImpact = Number(quote.details?.totalImpact?.percent ?? 0);
  if (Number.isFinite(totalImpact) && totalImpact < -MAX_BUY_TOTAL_IMPACT_PCT) {
    throw new Error(
      `relay total impact ${totalImpact}% (fees + impact) exceeds ${MAX_BUY_TOTAL_IMPACT_PCT}% sanity cap`
    );
  }
  const txid = await executeSolanaStep(input.signer, quote);
  const result = quoteResult(quote, txid);
  await awaitRelayFill(result.checkEndpoint);
  return result;
}

/**
 * Sell a Robinhood Chain token (or sweep USDG) from the agent's EVM wallet
 * back to USDC on its Solana balance. Executes each Relay step transaction
 * (approve, deposit) with the agent's EVM key; needs a dust of ETH for gas.
 */
export async function relaySellRhcToken(input: {
  account: PrivateKeyAccount;
  /** RHC token address (0x…) being sold; use USDG to sweep cash home. */
  token: string;
  amountRaw: bigint;
  /** Solana address that receives the USDC (the agent's fomo balance). */
  solRecipient: string;
}): Promise<RelayTradeResult> {
  if (input.amountRaw <= BigInt(0)) throw new Error("nothing to sell");
  const quote = await relayQuote({
    user: input.account.address,
    recipient: input.solRecipient,
    originChainId: RHC_CHAIN_ID,
    destinationChainId: SOLANA_CHAIN_ID,
    originCurrency: input.token,
    destinationCurrency: USDC_MINT,
    amount: input.amountRaw.toString(),
    tradeType: "EXACT_INPUT",
  });

  const { sendPreparedTx } = await import("@/lib/trading/dex");
  let lastHash = "";
  let checkEndpoint: string | null = null;
  for (const step of quote.steps ?? []) {
    for (const item of step.items ?? []) {
      const d = item.data;
      if (!d?.to || typeof d.data !== "string") continue;
      lastHash = await sendPreparedTx(input.account, {
        to: d.to as `0x${string}`,
        data: d.data as `0x${string}`,
        value: d.value ? BigInt(d.value) : BigInt(0),
      });
      if (item.check?.endpoint) checkEndpoint = `${RELAY_API}${item.check.endpoint}`;
    }
  }
  if (!lastHash) throw new Error("relay quote returned no EVM transactions");
  const result = quoteResult(quote, lastHash);
  result.checkEndpoint = checkEndpoint ?? result.checkEndpoint;
  await awaitRelayFill(result.checkEndpoint);
  return result;
}

export interface BridgeResult {
  txid: string;
  requestedUsd: number;
  expectedOutUsd: number;
  impactPercent: string;
  checkEndpoint: string | null;
}

/**
 * Ops rebalance: USDC (Solana) -> USDG or gas ETH on Robinhood Chain, into
 * the agent's EVM wallet. Used to top up sell-side gas; trading cash itself
 * stays on the Solana balance and routes per-trade.
 */
export async function bridgeSolanaUsdcToRhc(input: {
  signer: SolanaSigner;
  recipient: string;
  usd: number;
  receive: "usdg" | "eth";
}): Promise<BridgeResult> {
  const { signer, recipient, usd, receive } = input;
  if (usd < 2) throw new Error("bridge minimum is $2");
  if (!recipient.startsWith("0x") || recipient.length !== 42) {
    throw new Error("recipient must be an EVM address");
  }
  const quote = await relayQuote({
    user: signer.address,
    recipient,
    originChainId: SOLANA_CHAIN_ID,
    destinationChainId: RHC_CHAIN_ID,
    originCurrency: USDC_MINT,
    destinationCurrency: receive === "usdg" ? USDG : NATIVE_ETH,
    amount: String(Math.round(usd * 1e6)),
    tradeType: "EXACT_INPUT",
  });
  const impact = Number(quote.details?.totalImpact?.percent ?? 0);
  if (Number.isFinite(impact) && Math.abs(impact) > 3) {
    throw new Error(`relay impact ${impact}% too high — refusing to bridge`);
  }
  const txid = await executeSolanaStep(signer, quote);
  const r = quoteResult(quote, txid);
  return {
    txid,
    requestedUsd: usd,
    expectedOutUsd: r.outUsd,
    impactPercent: r.impactPercent,
    checkEndpoint: r.checkEndpoint,
  };
}
