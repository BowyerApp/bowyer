import "server-only";
import { USDG } from "@/lib/trading/dex";
import type { SolanaSigner } from "@/lib/trading/fomo-solana";

/**
 * Cross-chain rebalance via Relay (the same router fomo itself uses):
 * moves USDC from an agent's Solana wallet to USDG (or gas ETH) in its EVM
 * wallet on Robinhood Chain, funding the RHC side of the dual book. Used for
 * occasional rebalances, never per-trade — each chain executes natively.
 *
 * Relay returns raw Solana instructions plus address lookup tables, so the
 * v0 transaction is compiled with @solana/web3.js (dynamically imported —
 * this module is only ever loaded from admin routes on the node runtime).
 */

const RELAY_API = "https://api.relay.link";
const SOLANA_CHAIN_ID = 792703809;
const RHC_CHAIN_ID = 4663;
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NATIVE_ETH = "0x0000000000000000000000000000000000000000";

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

interface RelayQuote {
  steps: {
    id: string;
    items: {
      data: {
        instructions: RelayInstruction[];
        addressLookupTableAddresses?: string[];
      };
      check?: { endpoint: string };
    }[];
  }[];
  details?: {
    currencyOut?: { amountUsd?: string; amountFormatted?: string };
    totalImpact?: { percent?: string };
  };
  fees?: { relayer?: { amountUsd?: string } | string };
}

export interface BridgeResult {
  txid: string;
  requestedUsd: number;
  expectedOutUsd: number;
  impactPercent: string;
  checkEndpoint: string | null;
}

export async function bridgeSolanaUsdcToRhc(input: {
  signer: SolanaSigner;
  /** EVM recipient on Robinhood Chain (the agent's trading wallet). */
  recipient: string;
  /** USDC to bridge, in whole dollars. */
  usd: number;
  /** What to receive on RHC: USDG trading cash, or native ETH for gas. */
  receive: "usdg" | "eth";
}): Promise<BridgeResult> {
  const { signer, recipient, usd, receive } = input;
  if (usd < 2) throw new Error("bridge minimum is $2");
  if (!recipient.startsWith("0x") || recipient.length !== 42) {
    throw new Error("recipient must be an EVM address");
  }

  const res = await fetch(`${RELAY_API}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: signer.address,
      recipient,
      originChainId: SOLANA_CHAIN_ID,
      destinationChainId: RHC_CHAIN_ID,
      originCurrency: USDC_MINT,
      destinationCurrency: receive === "usdg" ? USDG : NATIVE_ETH,
      amount: String(Math.round(usd * 1e6)),
      tradeType: "EXACT_INPUT",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`relay quote ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const quote = (await res.json()) as RelayQuote;

  const item = quote.steps?.[0]?.items?.[0];
  const ixs = item?.data?.instructions;
  if (!ixs?.length) throw new Error("relay quote returned no instructions");

  const impact = quote.details?.totalImpact?.percent ?? "?";
  if (Math.abs(Number(impact)) > 3) {
    throw new Error(`relay impact ${impact}% too high — refusing to bridge`);
  }

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

  return {
    txid,
    requestedUsd: usd,
    expectedOutUsd: Number(quote.details?.currencyOut?.amountUsd ?? 0),
    impactPercent: String(impact),
    checkEndpoint: item.check?.endpoint ? `${RELAY_API}${item.check.endpoint}` : null,
  };
}
