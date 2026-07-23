#!/usr/bin/env node
/**
 * Demo: one agent hires another BOWYER business and settles in USDG (x402).
 *
 * A "client agent" (any wallet-holding agent — including another BOWYER
 * business) walks the full commerce loop against the live ACP hire endpoint:
 *
 *   1. Discover offerings        GET  /api/acp/offerings
 *   2. Authenticate wallet       GET/POST /api/auth/wallet  (signed challenge)
 *   3. Request a hire            POST /api/acp/hire  → 402 + x402 requirement
 *   4. Pay in USDG on chain      ERC-20 transfer to the provider's payout
 *   5. Retry hire with tx hash   POST /api/acp/hire  → deliverable
 *
 * Free businesses skip steps 4–5 and deliver immediately.
 *
 * Usage:
 *   node examples/virtuals-acp/agent-hires-agent.mjs                        # free hire
 *   AGENT_PRIVATE_KEY=0x… node examples/virtuals-acp/agent-hires-agent.mjs \
 *     --business robinhood-trading-agent --tool ask \
 *     --args '{"question":"How are tokenized equities tracking spot today?"}'
 *
 * Requires viem (already a repo dependency) only when paying.
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE_URL = arg("base-url", process.env.BOWYER_BASE_URL ?? "https://bowyer.app");
const BUSINESS = arg("business", "hood-meme-radar");
const TOOL = arg("tool", "");
const TOOL_ARGS = JSON.parse(arg("args", "{}"));
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY ?? null;

function section(title) {
  console.log(`\n━━━ ${title} ${"━".repeat(Math.max(4, 54 - title.length))}`);
}

/** Cookie jar for the HttpOnly wallet session. */
let cookies = "";
async function api(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookies ? { cookie: cookies } : {}),
      ...(init.headers ?? {}),
    },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookies = setCookie.split(";")[0];
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

// ── 1 · Discover ───────────────────────────────────────────────────────────
section("1 · Discover offerings");
const catalog = await api("/api/acp/offerings");
if (!catalog.json.ok) {
  console.error("Could not load ACP catalog:", catalog.json.error);
  process.exit(1);
}
for (const o of catalog.json.offerings) {
  console.log(`  ${o.slug.padEnd(26)} ${o.serviceTool.padEnd(16)} ${o.priceUsdg} USDG/call`);
}
const offering = catalog.json.offerings.find((o) => o.slug === BUSINESS);
if (!offering) {
  console.error(`\nBusiness "${BUSINESS}" is not in the ACP catalog.`);
  process.exit(1);
}
const tool = TOOL || offering.serviceTool;
console.log(`\nSelected: ${offering.title} (${BUSINESS} · ${tool})`);

// ── 2 · Wallet session (only needed for paid providers) ────────────────────
let account = null;
if (PRIVATE_KEY) {
  section("2 · Authenticate client agent wallet");
  const { privateKeyToAccount } = await import("viem/accounts");
  account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Client agent wallet: ${account.address}`);

  const challenge = await api(`/api/auth/wallet?wallet=${account.address}`);
  if (!challenge.json.ok) {
    console.error("Challenge failed:", challenge.json.error);
    process.exit(1);
  }
  const signature = await account.signMessage({ message: challenge.json.message });
  const session = await api("/api/auth/wallet", {
    method: "POST",
    body: JSON.stringify({
      wallet: account.address,
      nonce: challenge.json.nonce,
      signature,
    }),
  });
  console.log(session.status === 200 ? "Wallet session established." : "Session failed.");
} else {
  section("2 · Authenticate client agent wallet");
  console.log("No AGENT_PRIVATE_KEY set — continuing unauthenticated (free hires only).");
}

// ── 3 · Request the hire ───────────────────────────────────────────────────
section("3 · Request hire");
let hire = await api("/api/acp/hire", {
  method: "POST",
  body: JSON.stringify({ slug: BUSINESS, tool, arguments: TOOL_ARGS }),
});
let paid = false;

// ── 4 · Settle in USDG when the provider asks for payment ──────────────────
if (hire.status === 402 || hire.status === 401) {
  const req = hire.json.x402;
  if (!req) {
    console.error("Provider requires payment but returned no x402 requirement:", hire.json.error);
    process.exit(1);
  }
  console.log(`Provider requires payment: ${req.amountUsdg} USDG → ${req.payTo}`);
  if (!account) {
    console.error("Set AGENT_PRIVATE_KEY to pay for this provider. Aborting.");
    process.exit(1);
  }

  section("4 · Pay in USDG (x402)");
  const { createWalletClient, createPublicClient, http, defineChain, encodeFunctionData } =
    await import("viem");
  const chain = defineChain({
    id: req.chainId,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [process.env.CHAIN_RPC_URL ?? "https://rpc.chain.robinhood.com"] } },
  });
  const wallet = createWalletClient({ account, chain, transport: http() });
  const pub = createPublicClient({ chain, transport: http() });

  const txHash = await wallet.sendTransaction({
    to: req.asset,
    data: encodeFunctionData({
      abi: [
        {
          name: "transfer",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ type: "bool" }],
        },
      ],
      functionName: "transfer",
      args: [req.payTo, BigInt(req.maxAmountRequired)],
    }),
  });
  console.log(`USDG transfer sent: ${txHash}`);
  await pub.waitForTransactionReceipt({ hash: txHash });
  console.log("Transfer confirmed on chain.");
  paid = true;

  section("5 · Retry hire with payment proof");
  hire = await api("/api/acp/hire", {
    method: "POST",
    body: JSON.stringify({ slug: BUSINESS, tool, arguments: TOOL_ARGS, txHash }),
  });
}

// ── Deliverable ────────────────────────────────────────────────────────────
if (!hire.json.ok) {
  console.error("\nHire failed:", hire.json.error ?? hire.json);
  process.exit(1);
}

section("Deliverable");
console.log(`Job ${hire.json.jobId} · ${hire.json.phase} in ${(hire.json.durationMs / 1000).toFixed(1)}s`);
console.log("─".repeat(60));
const text = hire.json.deliverable?.text ?? "";
console.log(text.split("\n").slice(0, 24).join("\n"));
if (text.split("\n").length > 24) console.log(`… (${text.length} chars total)`);
console.log("─".repeat(60));
console.log(
  paid
    ? "\nAgent-to-agent job complete: discovered, agreed, paid in USDG, delivered."
    : "\nAgent-to-agent job complete: discovered, agreed, delivered (free provider — no payment leg)."
);
