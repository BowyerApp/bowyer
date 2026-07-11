import { createHash, randomBytes } from "node:crypto";
import { verifyMessage } from "viem";
import { db } from "@/lib/db";

const COOKIE_NAME = "bowyer_wallet_session";
const NONCE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isWallet(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function message(wallet: string, nonce: string): string {
  return [
    "Sign in to BOWYER",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    "This signature proves wallet ownership and never sends a transaction.",
  ].join("\n");
}

function cleanup(): void {
  const now = Date.now();
  db().prepare("DELETE FROM wallet_auth_nonces WHERE expires_at < ?").run(now);
  db().prepare("DELETE FROM wallet_sessions WHERE expires_at < ?").run(now);
  db().prepare("DELETE FROM oauth_states WHERE expires_at < ?").run(now);
}

export function createWalletNonce(wallet: string): { nonce: string; message: string } {
  if (!isWallet(wallet)) throw new Error("Invalid wallet");
  cleanup();
  const normalized = wallet.toLowerCase();
  const nonce = randomBytes(32).toString("base64url");
  db()
    .prepare("INSERT INTO wallet_auth_nonces (nonce, wallet, expires_at) VALUES (?, ?, ?)")
    .run(nonce, normalized, Date.now() + NONCE_TTL_MS);
  return { nonce, message: message(normalized, nonce) };
}

export async function createWalletSession(input: {
  wallet: string;
  nonce: string;
  signature: string;
}): Promise<string | null> {
  if (!isWallet(input.wallet)) return null;
  cleanup();
  const wallet = input.wallet.toLowerCase();
  const row = db()
    .prepare("SELECT wallet, expires_at FROM wallet_auth_nonces WHERE nonce = ?")
    .get(input.nonce) as { wallet: string; expires_at: number } | undefined;
  db().prepare("DELETE FROM wallet_auth_nonces WHERE nonce = ?").run(input.nonce);
  if (!row || row.wallet !== wallet || row.expires_at < Date.now()) return null;

  const valid = await verifyMessage({
    address: wallet as `0x${string}`,
    message: message(wallet, input.nonce),
    signature: input.signature as `0x${string}`,
  });
  if (!valid) return null;

  const token = randomBytes(32).toString("base64url");
  db()
    .prepare("INSERT INTO wallet_sessions (token_hash, wallet, expires_at) VALUES (?, ?, ?)")
    .run(hash(token), wallet, Date.now() + SESSION_TTL_MS);
  return token;
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000
  )}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getSessionWallet(req: Request): string | null {
  cleanup();
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!token) return null;

  const row = db()
    .prepare("SELECT wallet, expires_at FROM wallet_sessions WHERE token_hash = ?")
    .get(hash(token)) as { wallet: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return row.wallet;
}

export function requireWalletSession(req: Request, expectedWallet?: string): string | null {
  const wallet = getSessionWallet(req);
  if (!wallet) return null;
  if (expectedWallet && wallet !== expectedWallet.toLowerCase()) return null;
  return wallet;
}

export function createOAuthState(input: {
  wallet: string;
  provider: string;
  returnTo: string;
  payload?: Record<string, string>;
}): string {
  cleanup();
  const state = randomBytes(32).toString("base64url");
  db()
    .prepare(
      `INSERT INTO oauth_states (state, wallet, provider, return_to, payload, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      state,
      input.wallet.toLowerCase(),
      input.provider,
      input.returnTo,
      input.payload ? JSON.stringify(input.payload) : null,
      Date.now() + NONCE_TTL_MS
    );
  return state;
}

export function consumeOAuthState(state: string, provider: string): {
  wallet: string;
  returnTo: string;
  payload: Record<string, string>;
} | null {
  cleanup();
  const row = db()
    .prepare("SELECT wallet, provider, return_to, payload, expires_at FROM oauth_states WHERE state = ?")
    .get(state) as
    | { wallet: string; provider: string; return_to: string; payload: string | null; expires_at: number }
    | undefined;
  db().prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  if (!row || row.provider !== provider || row.expires_at < Date.now()) return null;
  let payload: Record<string, string> = {};
  try {
    payload = row.payload ? (JSON.parse(row.payload) as Record<string, string>) : {};
  } catch {}
  return { wallet: row.wallet, returnTo: row.return_to, payload };
}
