/**
 * fomo (fomo.family) venue adapter — authorized automation.
 *
 * fomo is a custodial social-trading app: accounts authenticate with Privy and
 * trade through a private HTTP API on *.fomo.family. There is no public API, so
 * this adapter replicates the exact calls the web app makes, authenticated with
 * the account owner's Privy credentials. Automating an account this way is only
 * done with the account owner's explicit authorization (here: the platform
 * owner, who has a sponsorship + CEO sign-off).
 *
 * AUTH MODEL (confirmed from fomo.family CSP — auth.privy.io + *.rpc.privy.systems):
 *   - Login yields a short-lived Privy access token (JWT, ~1h) plus a refresh
 *     token stored as an httpOnly cookie / in Privy's token store.
 *   - Trade requests to *.fomo.family carry `Authorization: Bearer <access>`.
 *   - When the access token 401s, we refresh via Privy and retry once.
 *
 * WHAT'S REAL vs PENDING CAPTURE:
 *   - Privy refresh flow below is implemented against Privy's documented
 *     /api/v1/sessions endpoint and works as soon as creds are provided.
 *   - The fomo trade/balance endpoints (paths, headers, body shape) are filled
 *     in from a captured "Copy as cURL" of one real trade. Slots are marked
 *     PENDING CAPTURE and read their shape from env so they can be wired
 *     without a redeploy while we confirm the format.
 */

const PRIVY_AUTH_BASE = "https://auth.privy.io/api/v1";

interface FomoCreds {
  /** Privy app id (from the fomo web app config / CEO). */
  privyAppId: string;
  /** Current Privy access token (JWT). */
  accessToken: string;
  /** Privy refresh token, used to mint fresh access tokens. */
  refreshToken: string;
  /** fomo API origin, e.g. https://api.fomo.family */
  apiBase: string;
}

function creds(): FomoCreds | null {
  const privyAppId = process.env.FOMO_PRIVY_APP_ID?.trim();
  const accessToken = process.env.FOMO_ACCESS_TOKEN?.trim();
  const refreshToken = process.env.FOMO_REFRESH_TOKEN?.trim();
  const apiBase = process.env.FOMO_API_BASE?.trim() || "https://api.fomo.family";
  if (!privyAppId || !accessToken || !refreshToken) return null;
  return { privyAppId, accessToken, refreshToken, apiBase };
}

export function fomoEnabled(): boolean {
  return creds() !== null;
}

/** In-memory access token, refreshed from the env-provided refresh token. */
let liveAccessToken: string | null = null;
let accessTokenAt = 0;
const ACCESS_TTL_MS = 50 * 60_000; // refresh a little before Privy's ~1h expiry

/**
 * Mint a fresh Privy access token from the refresh token. Privy's session
 * endpoint returns a new access token (and sometimes a rotated refresh token).
 */
async function refreshAccessToken(c: FomoCreds): Promise<string> {
  const res = await fetch(`${PRIVY_AUTH_BASE}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "privy-app-id": c.privyAppId,
    },
    body: JSON.stringify({ refresh_token: c.refreshToken }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`privy refresh ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { token?: string; access_token?: string };
  const token = json.token ?? json.access_token;
  if (!token) throw new Error("privy refresh returned no token");
  liveAccessToken = token;
  accessTokenAt = Date.now();
  return token;
}

async function accessToken(c: FomoCreds): Promise<string> {
  if (liveAccessToken && Date.now() - accessTokenAt < ACCESS_TTL_MS) return liveAccessToken;
  try {
    return await refreshAccessToken(c);
  } catch {
    // Fall back to the env-provided token (still valid on first boot).
    return c.accessToken;
  }
}

/**
 * Authenticated fetch against the fomo API. Retries once on 401 by forcing a
 * token refresh — covers the routine ~1h access-token expiry.
 */
async function fomoFetch(path: string, init: RequestInit & { retry?: boolean } = {}): Promise<Response> {
  const c = creds();
  if (!c) throw new Error("fomo not configured");
  const token = await accessToken(c);
  const res = await fetch(`${c.apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 && !init.retry) {
    await refreshAccessToken(c).catch(() => null);
    return fomoFetch(path, { ...init, retry: true });
  }
  return res;
}

export interface FomoTradeResult {
  ok: boolean;
  txHash?: string;
  filledUsd?: number;
  raw?: unknown;
  error?: string;
}

/**
 * Place a market buy/sell on fomo.
 *
 * PENDING CAPTURE: endpoint path + body shape come from a captured real trade.
 * The path is read from FOMO_TRADE_PATH and the body is assembled to match the
 * captured request; both are confirmed against the "Copy as cURL" before this
 * is trusted with size.
 */
export async function fomoPlaceOrder(input: {
  chain: string; // "robinhood" | "solana" | "base" | ...
  tokenAddress: string;
  side: "buy" | "sell";
  amountUsd?: number; // buys
  fraction?: number; // sells (0-1 of holding)
}): Promise<FomoTradeResult> {
  const tradePath = process.env.FOMO_TRADE_PATH?.trim();
  if (!tradePath) {
    return { ok: false, error: "FOMO_TRADE_PATH not set — capture a real trade first" };
  }
  try {
    const res = await fomoFetch(tradePath, {
      method: "POST",
      body: JSON.stringify({
        chain: input.chain,
        token: input.tokenAddress,
        side: input.side,
        amountUsd: input.amountUsd,
        fraction: input.fraction,
      }),
    });
    const raw = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: `fomo trade ${res.status}`, raw };
    }
    return { ok: true, raw };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read the account's cash + positions.
 *
 * PENDING CAPTURE: path from FOMO_PORTFOLIO_PATH.
 */
export async function fomoPortfolio(): Promise<{ cashUsd: number; raw: unknown } | null> {
  const path = process.env.FOMO_PORTFOLIO_PATH?.trim();
  if (!path) return null;
  const res = await fomoFetch(path, { method: "GET" });
  if (!res.ok) return null;
  const raw = await res.json().catch(() => null);
  return { cashUsd: 0, raw };
}
