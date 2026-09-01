/**
 * fomo feed thesis posting — fully headless, no browser.
 *
 * Proven end-to-end against fomo.family's production API. Two things make it work:
 *
 *  1. Auth: fomo's bearer is a short-lived Privy access token, but Privy also
 *     issues a long-lived REFRESH token. POSTing that refresh token to
 *     auth.privy.io/api/v1/sessions (with fomo's privy-app-id) mints a fresh
 *     bearer on demand — no login, no browser. The refresh token rotates, so we
 *     persist the latest value in the DB (trading_kv) and use FOMO_REFRESH_TOKEN
 *     only as the initial seed.
 *
 *  2. Transport: prod-api.fomo.family sits behind Cloudflare bot-fight mode that
 *     blocks on TLS fingerprint. A normal Node fetch is fingerprinted as Node and
 *     rejected with HTTP 430. We route every request through cycletls with a
 *     spoofed Chrome JA3 so Cloudflare sees a real browser. (On datacenter IPs
 *     Cloudflare may still IP-block; set FOMO_PROXY_URL to a residential proxy.)
 *
 * Posting model: a thesis is a public comment on a fomo *trade* UUID. fomo indexes
 * the wallet's on-chain swaps (including our direct Jupiter fills) into swaps that
 * carry inTradeId/outTradeId. We read GET /v2/users/{uuid}/swaps, match our token,
 * take the trade id, and POST /trades/comment {tradeId, comment, visibility}.
 *
 * Setup: log into fomo.family once, copy the Privy refresh token from DevTools
 * (localStorage key "privy:refresh_token"), set FOMO_REFRESH_TOKEN.
 */

import os from "node:os";
import path from "node:path";
import { copyFileSync, chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import {
  kvGet,
  kvSet,
  markThesisFomoPosted,
  pendingFomoTheses,
  type ThesisRow,
} from "@/lib/trading/store";

const API_BASE = process.env.FOMO_API_BASE?.trim() || "https://prod-api.fomo.family";
const PRIVY_AUTH_API = "https://auth.privy.io";
const PRIVY_APP_ID = "cm6h485o300n3zj9yl6vpedq7"; // fomo.family's Privy app (JWT aud)
const SUPPORTED_CHAINS = "1,56,143,4663,8453,1399811149";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROME_JA3 =
  "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0";

const KV_REFRESH = "fomo_privy_refresh_token";
const KV_BEARER = "fomo_privy_bearer";

/* ---------------- jwt helpers ---------------- */

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function jwtExpMs(token: string): number {
  const exp = Number(jwtPayload(token).exp ?? 0);
  return exp > 0 ? exp * 1000 : 0;
}

/* ---------------- cycletls transport (Chrome JA3 spoof) ---------------- */

type CycleResponse = { status: number; body?: unknown; data?: unknown; text?: unknown };
type CycleClient = (
  url: string,
  opts: { ja3: string; userAgent: string; headers: Record<string, string>; body: string; proxy?: string },
  method: string
) => Promise<CycleResponse>;

let cycleClient: CycleClient | null = null;
let cycleFailedAt = 0;

/**
 * Resolve the platform-specific cycletls binary path, copying out of any
 * space-containing path. Returns null when the binary is genuinely absent — in
 * that case we must NOT init cycletls, because it throws asynchronously from its
 * spawn handler (an uncaught exception that would crash the process).
 */
function cycleBinaryPath(): string | null {
  const PLATFORM: Record<string, Record<string, string>> = {
    win32: { x64: "index.exe" },
    linux: { arm: "index-arm", arm64: "index-arm64", x64: "index" },
    darwin: { x64: "index-mac", arm: "index-mac-arm", arm64: "index-mac-arm64" },
  };
  const file = PLATFORM[process.platform]?.[os.arch()];
  if (!file) return null;

  // Candidate dist dirs. createRequire is unreliable from inside the bundled
  // Next server chunk, so also probe cwd/node_modules (standalone runs at /app).
  const dirs: string[] = [];
  try {
    const req = createRequire(import.meta.url);
    dirs.push(path.join(path.dirname(req.resolve("cycletls/package.json")), "dist"));
  } catch {
    /* fall through to cwd-based candidates */
  }
  dirs.push(path.join(process.cwd(), "node_modules", "cycletls", "dist"));

  for (const dir of dirs) {
    const src = path.join(dir, file);
    if (!existsSync(src)) continue;
    if (/\s/.test(src)) {
      const dest = path.join(os.tmpdir(), "bowyer-cycletls");
      if (!existsSync(dest)) {
        copyFileSync(src, dest);
        chmodSync(dest, 0o755);
      }
      return dest;
    }
    return src;
  }
  return null;
}

async function getCycle(): Promise<CycleClient | null> {
  if (cycleFailedAt && Date.now() - cycleFailedAt < 5 * 60_000) return null;
  if (cycleClient) return cycleClient;
  const executablePath = cycleBinaryPath();
  if (!executablePath) {
    cycleFailedAt = Date.now();
    console.error("[fomo-thesis] cycletls binary not found for this platform — thesis posting disabled");
    return null;
  }
  try {
    type Init = (opts?: unknown) => Promise<CycleClient>;
    const mod = (await import("cycletls")) as unknown as { default?: unknown };
    const dflt = mod.default as (Init & { default?: Init }) | undefined;
    const init: Init | undefined =
      typeof dflt === "function" ? dflt : (dflt as { default?: Init } | undefined)?.default;
    if (typeof init !== "function") throw new Error("cycletls default export missing");
    cycleClient = await init({ timeout: 30_000, executablePath });
    return cycleClient;
  } catch (e) {
    cycleFailedAt = Date.now();
    console.error("[fomo-thesis] cycletls init failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

function readBody(res: CycleResponse): string {
  const raw = res.body ?? res.data ?? res.text;
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw ?? "");
  } catch {
    return "";
  }
}

async function transport(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<{ status: number; text: string }> {
  const client = await getCycle();
  if (!client) throw new Error("cycletls unavailable — cannot reach fomo API");
  const proxy = process.env.FOMO_PROXY_URL?.trim();
  const res = await client(
    url,
    { ja3: CHROME_JA3, userAgent: CHROME_UA, headers, body, ...(proxy ? { proxy } : {}) },
    method.toLowerCase()
  );
  return { status: res.status, text: readBody(res) };
}

/* ---------------- privy session ---------------- */

function storedRefreshToken(): string {
  return kvGet(KV_REFRESH) ?? process.env.FOMO_REFRESH_TOKEN?.trim() ?? "";
}

export function fomoThesisEnabled(): boolean {
  return Boolean(storedRefreshToken());
}

let bearerCache = "";

async function refreshPrivy(): Promise<void> {
  const refreshToken = storedRefreshToken();
  if (!refreshToken) throw new Error("no FOMO_REFRESH_TOKEN configured");
  const headers = {
    "Content-Type": "application/json",
    "privy-app-id": PRIVY_APP_ID,
    "privy-client": "react-auth:2.5.0",
    Origin: "https://fomo.family",
    Referer: "https://fomo.family/",
  };
  const body = JSON.stringify({ refresh_token: refreshToken });
  let res = await transport("POST", `${PRIVY_AUTH_API}/api/v1/sessions`, headers, body);
  if (res.status >= 400) {
    const did = String(jwtPayload(bearerCache || (kvGet(KV_BEARER) ?? "")).sub ?? "");
    if (did) {
      res = await transport(
        "POST",
        `${PRIVY_AUTH_API}/api/v1/users/${encodeURIComponent(did)}/sessions`,
        headers,
        body
      );
    }
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `privy refresh failed ${res.status}: ${res.text.slice(0, 160)} — re-seed FOMO_REFRESH_TOKEN from fomo.family DevTools`
    );
  }
  let data: { token?: string; refresh_token?: string } = {};
  try {
    data = JSON.parse(res.text);
  } catch {
    throw new Error("privy refresh returned non-JSON");
  }
  const token = String(data.token ?? "").trim();
  if (!token) throw new Error("privy refresh returned no token");
  bearerCache = token;
  kvSet(KV_BEARER, token);
  const rotated = String(data.refresh_token ?? "").trim();
  if (rotated && rotated !== refreshToken) kvSet(KV_REFRESH, rotated);
}

async function ensureBearer(): Promise<string> {
  if (!bearerCache) bearerCache = kvGet(KV_BEARER) ?? "";
  if (bearerCache && jwtExpMs(bearerCache) > Date.now() + 5 * 60_000) return bearerCache;
  await refreshPrivy();
  return bearerCache;
}

/* ---------------- fomo api ---------------- */

function unwrap(json: unknown): unknown {
  const obj = json as { responseObject?: unknown } | null;
  return obj && typeof obj === "object" && obj.responseObject != null ? obj.responseObject : json;
}

async function fomoFetch(p: string, opts: { method?: string; body?: unknown } = {}): Promise<unknown> {
  await ensureBearer();
  const url = `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
  const headers = () => ({
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearerCache}`,
    "X-Supported-Chains": SUPPORTED_CHAINS,
    Origin: "https://fomo.family",
    Referer: "https://fomo.family/",
  });
  const body = opts.body != null ? JSON.stringify(opts.body) : "";

  let res = await transport(opts.method ?? "GET", url, headers(), body);
  if (res.status === 401 || res.status === 430) {
    // 430 = Cloudflare/edge rejected; a refreshed bearer + retry usually clears it.
    await refreshPrivy();
    res = await transport(opts.method ?? "GET", url, headers(), body);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`fomo ${res.status} ${p}: ${res.text.slice(0, 160)}`);
  }
  let json: unknown = {};
  try {
    json = JSON.parse(res.text);
  } catch {
    /* some endpoints return empty bodies on success */
  }
  const j = json as { success?: boolean; statusCode?: number; message?: string };
  if (j.success === false || (typeof j.statusCode === "number" && j.statusCode >= 400)) {
    throw new Error(`fomo error ${p}: ${j.message ?? res.text.slice(0, 160)}`);
  }
  return unwrap(json);
}

/** Public fomo API accessor (auth + Cloudflare-safe transport) for other modules. */
export async function fomoApi(p: string, opts: { method?: string; body?: unknown } = {}): Promise<unknown> {
  return fomoFetch(p, opts);
}

/** Resolve our own fomo user id (uuid) — exported for the social module. */
export async function fomoCurrentUserId(): Promise<string> {
  return currentUserId();
}

let cachedUserId = "";

async function currentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const u = (await fomoFetch("/v2/users/current")) as { id?: unknown };
  const id = String(u?.id ?? "").trim();
  if (!id) throw new Error("could not resolve fomo user id");
  cachedUserId = id;
  return id;
}

function addrEq(a: string, b: string): boolean {
  // Case-insensitive on purpose: our internal store lowercases every token
  // (recordFill), while fomo returns case-sensitive base58 mints. Comparing
  // lowercased matches our queued theses to fomo's swaps. Collision risk across
  // a single wallet's handful of swaps is negligible.
  return a.toLowerCase() === b.toLowerCase();
}

interface FomoSwap {
  inTokenAddress?: string;
  outTokenAddress?: string;
  inTradeId?: string | null;
  outTradeId?: string | null;
  createdAt?: string;
}

/**
 * Resolve the fomo trade UUID for our most recent swap in a token. For a buy the
 * position is the swap's outTradeId (token received); for a sell it's inTradeId.
 * Returns null when fomo hasn't indexed the swap yet — the thesis stays queued.
 */
async function findTradeId(row: ThesisRow): Promise<string | null> {
  const uid = await currentUserId();
  const ro = (await fomoFetch(`/v2/users/${encodeURIComponent(uid)}/swaps`)) as
    | FomoSwap[]
    | { items?: FomoSwap[]; swaps?: FomoSwap[] };
  const swaps = Array.isArray(ro) ? ro : (ro.items ?? ro.swaps ?? []);
  for (const s of swaps) {
    if (row.side === "buy" && s.outTokenAddress && addrEq(s.outTokenAddress, row.token) && s.outTradeId) {
      return s.outTradeId;
    }
    if (row.side === "sell" && s.inTokenAddress && addrEq(s.inTokenAddress, row.token) && s.inTradeId) {
      return s.inTradeId;
    }
  }
  // Fallback: most recent swap that carries any trade id for this token.
  for (const s of swaps) {
    const id = s.outTradeId ?? s.inTradeId;
    if (id && (addrEq(s.outTokenAddress ?? "", row.token) || addrEq(s.inTokenAddress ?? "", row.token))) {
      return id;
    }
  }
  return null;
}

/** Connectivity self-test: proves the server can auth + reach fomo through Cloudflare. */
export async function fomoThesisPing(): Promise<{
  ok: boolean;
  userId?: string;
  swaps?: number;
  error?: string;
}> {
  if (!fomoThesisEnabled()) return { ok: false, error: "no FOMO_REFRESH_TOKEN configured" };
  try {
    const uid = await currentUserId();
    const ro = (await fomoFetch(`/v2/users/${encodeURIComponent(uid)}/swaps`)) as
      | FomoSwap[]
      | { items?: FomoSwap[]; swaps?: FomoSwap[] };
    const swaps = Array.isArray(ro) ? ro : (ro.items ?? ro.swaps ?? []);
    return { ok: true, userId: uid, swaps: swaps.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function postOne(row: ThesisRow): Promise<boolean> {
  const tradeId = await findTradeId(row);
  if (!tradeId) return false; // not indexed yet — retry next flush
  await fomoFetch("/trades/comment", {
    method: "POST",
    body: { tradeId, comment: row.thesis, visibility: "public" },
  });
  return true;
}

/**
 * Flush queued fomo theses. Safe to call on a schedule; no-ops (leaving the
 * queue intact) when no refresh token is configured. Returns a small report.
 */
export async function flushFomoTheses(limit = 10): Promise<{
  enabled: boolean;
  attempted: number;
  posted: number;
  pending: number;
  lastError?: string;
}> {
  if (!fomoThesisEnabled()) {
    return { enabled: false, attempted: 0, posted: 0, pending: pendingFomoTheses(limit).length };
  }
  const rows = pendingFomoTheses(limit);
  let posted = 0;
  let lastError: string | undefined;
  for (const row of rows) {
    try {
      if (await postOne(row)) {
        markThesisFomoPosted(row.id);
        posted += 1;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // Auth/transport failures affect every row — stop early, retry next flush.
      if (/privy refresh failed|cycletls|FOMO_REFRESH_TOKEN|430/i.test(lastError)) break;
    }
  }
  return {
    enabled: true,
    attempted: rows.length,
    posted,
    pending: pendingFomoTheses(limit).length,
    ...(lastError ? { lastError } : {}),
  };
}
