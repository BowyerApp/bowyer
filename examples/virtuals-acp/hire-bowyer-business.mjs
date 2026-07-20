#!/usr/bin/env node
/**
 * Demo: a Virtuals ACP-style agent hires a BOWYER business.
 *
 * Walks the four ACP job phases (Request → Negotiation → Transaction →
 * Evaluation) where the deliverable is produced by a BOWYER business over its
 * MCP endpoint. Zero dependencies — run with:
 *
 *   node examples/virtuals-acp/hire-bowyer-business.mjs
 *   node examples/virtuals-acp/hire-bowyer-business.mjs --business hood-meme-radar --tool get_radar
 *
 * In a production ACP integration the provider agent wraps a BOWYER business:
 * it registers the business's output as an ACP resource offering, escrow and
 * memos are handled by the ACP SDK, and this script's phase functions become
 * the provider's job handlers. See README.md in this folder.
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE_URL = arg("base-url", "https://bowyer.app");
const BUSINESS = arg("business", "hood-meme-radar");
const TOOL = arg("tool", "get_radar");
const TOOL_ARGS = JSON.parse(arg("args", "{}"));

let rpcId = 0;
async function mcp(method, params) {
  const res = await fetch(`${BASE_URL}/api/mcp/${BUSINESS}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`MCP ${method} failed (${json.error.code}): ${json.error.message}`);
  }
  return json.result;
}

function phase(n, name) {
  console.log(`\n━━━ Phase ${n} · ${name} ${"━".repeat(Math.max(4, 46 - name.length))}`);
}

function firstText(result) {
  const item = result?.content?.find((c) => c.type === "text");
  return item?.text ?? "";
}

// ---------------------------------------------------------------------------

console.log("Virtuals ACP client agent → BOWYER business");
console.log(`Provider: ${BASE_URL}/api/mcp/${BUSINESS}`);

// Phase 1 — Request: establish contact, confirm the provider is compatible.
phase(1, "Request");
const discovery = await fetch(`${BASE_URL}/api/mcp/${BUSINESS}`).then((r) => r.json());
console.log(`Provider online: ${discovery.name} v${discovery.version} (${discovery.protocol})`);
console.log(`Advertised tools: ${discovery.tools.join(", ")}`);
if (!discovery.tools.includes(TOOL)) {
  console.error(`Requested service "${TOOL}" not offered — aborting job request.`);
  process.exit(1);
}

const status = await mcp("tools/call", { name: "get_status", arguments: {} });
console.log(`Provider status:\n${firstText(status).split("\n").slice(0, 6).join("\n")}`);

// Phase 2 — Negotiation: agree terms. In live ACP both sides sign a memo to
// create the Proof of Agreement; here we build the same terms object locally.
phase(2, "Negotiation");
const agreement = {
  jobId: `demo-${Date.now().toString(36)}`,
  client: "acp-demo-agent",
  provider: BUSINESS,
  service: TOOL,
  serviceArgs: TOOL_ARGS,
  priceUsd: 0, // free business — paid businesses settle via on-chain subscription
  deliverable: "text/markdown report over MCP",
  agreedAt: new Date().toISOString(),
};
console.log("Proof of Agreement (unsigned demo):");
console.log(JSON.stringify(agreement, null, 2));

// Phase 3 — Transaction: provider performs the work. For paid BOWYER
// businesses this call requires an active subscription + signed wallet
// session (HTTP 402 otherwise) — that is the escrow/payment leg.
phase(3, "Transaction");
console.log(`Executing ${TOOL} on ${BUSINESS}…`);
const startedAt = Date.now();
const work = await mcp("tools/call", { name: TOOL, arguments: TOOL_ARGS });
const deliverable = firstText(work);
console.log(`Deliverable received in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
console.log("─".repeat(60));
console.log(deliverable.split("\n").slice(0, 20).join("\n"));
if (deliverable.split("\n").length > 20) console.log(`… (${deliverable.length} chars total)`);
console.log("─".repeat(60));

// Phase 4 — Evaluation (optional in ACP v2): check the deliverable against
// the agreement before releasing escrow.
phase(4, "Evaluation");
const checks = [
  ["deliverable is non-empty", deliverable.trim().length > 0],
  ["deliverable is substantive (>200 chars)", deliverable.length > 200],
  ["provider matches agreement", agreement.provider === BUSINESS],
  ["service matches agreement", agreement.service === TOOL],
];
let pass = true;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✔" : "✘"} ${label}`);
  if (!ok) pass = false;
}

console.log(
  pass
    ? `\nJob ${agreement.jobId} COMPLETED — evaluator approves, escrow would release to provider.`
    : `\nJob ${agreement.jobId} REJECTED — evaluator withholds escrow.`
);
process.exit(pass ? 0 : 1);
