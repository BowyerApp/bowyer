/**
 * Structural validation of the hand-built USDC withdrawal transaction.
 * Simulates on mainnet with sigVerify:false — no funds move, no real key
 * needed. We impersonate a large USDC holder as the signer so the transfer
 * is semantically valid end to end.
 */
import bs58 from "bs58";
import { randomBytes } from "node:crypto";
import { buildUsdcWithdrawTx, USDC_MINT } from "../src/lib/trading/fomo-solana";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: any; error?: { message?: string } };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

async function hasUsdcAccount(owner: string): Promise<boolean> {
  const r = await rpc("getTokenAccountsByOwner", [owner, { mint: USDC_MINT }, { encoding: "jsonParsed" }]);
  return (r?.value?.length ?? 0) > 0;
}

// House fomo wallet as the impersonated source; known-active wallets as
// destination candidates (first with a USDC account wins).
const srcOwner = "UWYh46PVu3RpDFJvr37XKDQnoLWYPPaHtQ4bH3UpzXj";
const dstCandidates = [
  "3TKJ9PSQHEChgz5ymAHWzy85k8t1W4RcFGbDrdPhX8HL",
  "BKXtSJWJk8s6DGEv71a3HohqHMhzn1iXLAzxMm6ZXjmy",
  // well-known exchange hot wallets (huge USDC holders)
  "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS",
  "FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5",
];
let dstOwner = "";
for (const c of dstCandidates) {
  try {
    if (bs58.decode(c).length !== 32) {
      console.log("skip (not a pubkey):", c);
      continue;
    }
    const ok = await hasUsdcAccount(c);
    console.log(ok ? "USDC account found:" : "no USDC account:", c);
    if (ok) {
      dstOwner = c;
      break;
    }
  } catch (e) {
    console.log("candidate error:", c, (e as Error).message);
  }
}
if (!dstOwner) throw new Error("no destination candidate has a USDC account");
console.log("src owner (impersonated):", srcOwner);
console.log("dst owner:", dstOwner);

// Fake secret key whose derived pubkey equals the src owner — signature will
// be garbage, but sigVerify:false only checks structure + semantics.
const secretKey = new Uint8Array(64);
secretKey.set(randomBytes(32), 0);
secretKey.set(bs58.decode(srcOwner), 32);

const { tx, amountUsd } = await buildUsdcWithdrawTx({ address: srcOwner, secretKey }, dstOwner);
console.log("built tx, base64 length:", tx.length, "— would move $", amountUsd.toFixed(2));

const sim = await rpc("simulateTransaction", [
  tx,
  { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true },
]);
console.log("simulation err:", JSON.stringify(sim.value.err));
console.log("logs:", (sim.value.logs ?? []).join("\n      "));
if (sim.value.err === null) {
  console.log("\nPASS — transaction deserializes and the SPL transfer executes cleanly");
} else {
  console.log("\nFAIL — inspect logs above");
  process.exit(1);
}
