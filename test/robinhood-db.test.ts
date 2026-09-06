import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dbPath = join(tmpdir(), `bowyer-robinhood-test-${process.pid}.db`);
process.env.BOWYER_DB_PATH = dbPath;
process.env.OAUTH_ENCRYPTION_KEY = "test-only-robinhood-encryption-key";
process.env.NEXT_PUBLIC_SITE_URL = "https://bowyer.test";

let auth: typeof import("../src/lib/wallet-auth");
let store: typeof import("../src/lib/robinhood-trading");
let database: typeof import("../src/lib/db");
let redirects: typeof import("../src/lib/oauth/redirect");

test.before(async () => {
  auth = await import("../src/lib/wallet-auth");
  store = await import("../src/lib/robinhood-trading");
  database = await import("../src/lib/db");
  redirects = await import("../src/lib/oauth/redirect");
});

test("OAuth result query parameters remain before URL fragments", () => {
  const response = redirects.oauthRedirectSuccess("/portfolio?tab=trading#orders", "robinhood");
  assert.equal(
    response.headers.get("location"),
    "https://bowyer.test/portfolio?tab=trading&oauth=robinhood_ok#orders"
  );
});

test.after(() => {
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
});

test("OAuth state and PKCE payload are one-time and wallet-bound", () => {
  const wallet = "0x0000000000000000000000000000000000000001";
  const state = auth.createOAuthState({
    wallet,
    provider: "robinhood",
    returnTo: "/portfolio",
    payload: { code_verifier: "verifier", client_id: "client" },
  });
  assert.deepEqual(auth.consumeOAuthState(state, "robinhood"), {
    wallet,
    returnTo: "/portfolio",
    payload: { code_verifier: "verifier", client_id: "client" },
  });
  assert.equal(auth.consumeOAuthState(state, "robinhood"), null);
});

test("OAuth access and refresh tokens are encrypted and erased on revoke", () => {
  const wallet = "0x0000000000000000000000000000000000000002";
  store.upsertRobinhoodConnection({
    wallet,
    status: "linked",
    accessToken: "access-secret",
    refreshToken: "refresh-secret",
    expiresAt: Date.now() + 60_000,
    clientId: "client-id",
  });
  const row = database
    .db()
    .prepare("SELECT access_token_enc, refresh_token_enc FROM robinhood_connections WHERE wallet = ?")
    .get(wallet) as { access_token_enc: string; refresh_token_enc: string };
  assert.notEqual(row.access_token_enc, "access-secret");
  assert.notEqual(row.refresh_token_enc, "refresh-secret");
  assert.equal(store.getRobinhoodTokens(wallet)?.accessToken, "access-secret");
  store.disconnectRobinhood(wallet, true);
  assert.equal(store.getRobinhoodTokens(wallet), null);
});

test("decision creation is idempotent and status claims are atomic", () => {
  const wallet = "0x0000000000000000000000000000000000000001";
  const input = {
    wallet,
    symbol: "AAPL",
    side: "buy" as const,
    thesis: "A sufficiently detailed test thesis for a reviewed order.",
    policyVersion: 1,
    policyAllowed: true,
    policyReasons: [],
    mode: "approval" as const,
    notionalUsd: 100,
    quantity: 1,
    idempotencyKey: "same-request",
  };
  const first = store.createTradeDecision(input);
  const replay = store.createTradeDecision(input);
  assert.equal(replay.id, first.id);
  assert.throws(
    () => store.createTradeDecision({ ...input, symbol: "MSFT" }),
    /different order/
  );

  const reviewed = store.updateDecisionStatus(wallet, first.id, "reviewed", {
    from: ["proposed"],
  });
  assert.equal(reviewed?.status, "reviewed");
  assert.equal(
    store.updateDecisionStatus(wallet, first.id, "reviewed", { from: ["proposed"] }),
    null
  );
  assert.equal(store.listDecisionEvents(wallet, first.id).length, 2);
  assert.equal(store.pendingSymbolExposureUsd(wallet, "AAPL"), 100);
});

test("wallet execution leases and atomic kill switch claims fail closed", () => {
  const wallet = "0x0000000000000000000000000000000000000003";
  const lease = store.acquireRobinhoodWalletLease(wallet);
  assert.ok(lease);
  assert.equal(store.acquireRobinhoodWalletLease(wallet), null);
  store.releaseRobinhoodWalletLease(wallet, lease);
  assert.ok(store.acquireRobinhoodWalletLease(wallet));

  const policy = store.getTradingPolicy(wallet);
  const halted = store.saveTradingPolicy({ ...policy, killSwitch: true });
  store.upsertRobinhoodConnection({ wallet, status: "linked" });
  const decision = store.createTradeDecision({
    wallet,
    symbol: "NVDA",
    side: "buy",
    thesis: "A sufficiently detailed atomic claim test thesis.",
    policyVersion: halted.version,
    policyAllowed: true,
    policyReasons: [],
    mode: "approval",
    notionalUsd: 100,
    quantity: 1,
    idempotencyKey: "atomic-kill-switch",
    status: "approved",
    reviewExpiresAt: Date.now() + 60_000,
  });
  assert.equal(store.claimDecisionSubmission(wallet, decision.id), null);
});

test("submitted decisions remain recoverable for reconciliation", () => {
  const wallet = "0x0000000000000000000000000000000000000001";
  const decision = store.createTradeDecision({
    wallet,
    symbol: "MSFT",
    side: "buy",
    thesis: "A sufficiently detailed restart recovery test thesis.",
    policyVersion: 1,
    policyAllowed: true,
    policyReasons: [],
    mode: "approval",
    notionalUsd: 100,
    quantity: 1,
    idempotencyKey: "restart-recovery",
    status: "approved",
  });
  const submitted = store.updateDecisionStatus(wallet, decision.id, "submitted", {
    from: ["approved"],
    brokerOrderId: "broker-1",
  });
  assert.equal(submitted?.status, "submitted");
  assert.ok(store.listSubmittedTradeDecisions().some((row) => row.id === decision.id));
});
