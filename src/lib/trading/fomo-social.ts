/**
 * fomo social presence: learn the local thesis style, and discover + follow +
 * track traders worth watching.
 *
 * All calls reuse the authenticated, Cloudflare-safe transport in fomo-thesis
 * (Privy refresh token + cycletls JA3 spoof). Everything degrades to a no-op
 * when FOMO_REFRESH_TOKEN isn't configured.
 *
 *  - studyTheses(): read real theses from tokens we're active in, keep the
 *    best-written ones as few-shot style exemplars (cached in trading_kv). The
 *    analyst injects these so our theses read like the community's, not a bot's.
 *
 *  - discoverAndFollow(): gather trader ids from those same thesis feeds plus our
 *    own followers, pull each profile, score them on real activity (trades,
 *    volume, hold time, audience), follow the best, and persist the ranked list
 *    so we know who is worth tracking.
 */

import {
  isTrackedFollowed,
  trackedTraders,
  upsertTrackedTrader,
  type TrackedTrader,
} from "@/lib/trading/store";
import { saveThesisExemplars, type ThesisExemplar } from "@/lib/trading/fomo-style";

// fomo-thesis pulls in cycletls (a native, spawn-based module) which must stay
// OUT of any static/startup bundle graph. This module is therefore only ever
// imported *dynamically* (by cron/admin), and it in turn imports fomo-thesis
// dynamically too. The analyst reads exemplars from fomo-style instead, so it
// never reaches this module on its startup path.
async function fomoLib() {
  return import("@/lib/trading/fomo-thesis");
}

const SOLANA_NETWORK_ID = 1399811149;

interface ThesisFeedItem {
  userId?: string;
  displayName?: string;
  userHandle?: string;
  comment?: { comment?: string } | string;
}

interface FomoProfile {
  id: string;
  displayName?: string;
  userHandle?: string;
  followers?: number;
  following?: number;
  numTrades?: number;
  swapCount?: number;
  totalVolume?: number;
  averageHoldTimeSeconds?: number;
  followsCurrentUser?: boolean;
  isRestricted?: boolean;
  private?: boolean;
}

interface FomoSwap {
  inTokenAddress?: string;
  outTokenAddress?: string;
  inNetworkId?: number;
  outNetworkId?: number;
}

function commentText(item: ThesisFeedItem): string {
  const c = item.comment;
  if (!c) return "";
  return (typeof c === "string" ? c : c.comment ?? "").trim();
}

/** Tokens (Solana mints) we've actually traded — the feeds most relevant to us. */
async function ourTokens(uid: string): Promise<string[]> {
  try {
    const { fomoApi } = await fomoLib();
    const ro = (await fomoApi(`/v2/users/${encodeURIComponent(uid)}/swaps`)) as
      | FomoSwap[]
      | { items?: FomoSwap[]; swaps?: FomoSwap[] };
    const swaps = Array.isArray(ro) ? ro : (ro.items ?? ro.swaps ?? []);
    const mints = new Set<string>();
    for (const s of swaps) {
      if (s.outNetworkId === SOLANA_NETWORK_ID && s.outTokenAddress && !s.outTokenAddress.startsWith("0x")) {
        mints.add(s.outTokenAddress);
      }
    }
    return [...mints];
  } catch {
    return [];
  }
}

async function thesisFeed(tokenAddress: string): Promise<ThesisFeedItem[]> {
  try {
    const { fomoApi } = await fomoLib();
    const qs = new URLSearchParams({ tokenAddress, networkId: String(SOLANA_NETWORK_ID) });
    const ro = (await fomoApi(`/feed/token/thesis?${qs.toString()}`)) as
      | { items?: ThesisFeedItem[] }
      | ThesisFeedItem[];
    return Array.isArray(ro) ? ro : (ro.items ?? []);
  } catch {
    return [];
  }
}

/**
 * Read real theses from the tokens we trade, keep well-formed exemplars, and
 * cache them for the analyst's prompt. Returns the exemplars it stored.
 */
export async function studyTheses(maxExamples = 12): Promise<ThesisExemplar[]> {
  const { fomoThesisEnabled, fomoCurrentUserId } = await fomoLib();
  if (!fomoThesisEnabled()) return [];
  let uid = "";
  try {
    uid = await fomoCurrentUserId();
  } catch {
    return [];
  }
  const tokens = await ourTokens(uid);
  const seen = new Set<string>();
  const exemplars: ThesisExemplar[] = [];
  for (const token of tokens.slice(0, 12)) {
    const feed = await thesisFeed(token);
    for (const item of feed) {
      if (item.userId === uid) continue; // learn from others, not ourselves
      const text = commentText(item);
      // Keep substantive, self-contained theses; skip one-liners and spam.
      if (text.length < 80 || text.length > 600) continue;
      const key = text.slice(0, 40).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      exemplars.push({ handle: item.userHandle || item.displayName || "trader", text });
      if (exemplars.length >= maxExamples) break;
    }
    if (exemplars.length >= maxExamples) break;
  }
  saveThesisExemplars(exemplars);
  return exemplars;
}

/* ---------------- discover + follow ---------------- */

function scoreTrader(p: FomoProfile): number {
  const trades = Math.min(p.numTrades ?? 0, 250) / 250; // activity
  const volume = Math.min(p.totalVolume ?? 0, 100_000) / 100_000; // conviction/size
  const audience = Math.min(p.followers ?? 0, 500) / 500; // social proof
  // Prefer real swing/position holds (10 min .. 3 days); punish scalp-bots and dead accounts.
  const hold = p.averageHoldTimeSeconds ?? 0;
  const holdScore = hold >= 600 && hold <= 259_200 ? 1 : hold > 0 ? 0.4 : 0;
  return trades * 0.4 + volume * 0.3 + audience * 0.15 + holdScore * 0.15;
}

/**
 * Follow a trader. fomo's route is POST /follows with the ACTOR in user_id
 * (must be us) and the target in following_id — verified live against the API.
 */
async function follow(myUuid: string, targetUuid: string): Promise<boolean> {
  const { fomoApi } = await fomoLib();
  try {
    await fomoApi("/follows", { method: "POST", body: { user_id: myUuid, following_id: targetUuid } });
    return true;
  } catch {
    return false;
  }
}

async function profile(uuid: string): Promise<FomoProfile | null> {
  try {
    const { fomoApi } = await fomoLib();
    return (await fomoApi(`/v2/users/${encodeURIComponent(uuid)}`)) as FomoProfile;
  } catch {
    return null;
  }
}

async function ourFollowerIds(uid: string): Promise<string[]> {
  try {
    const { fomoApi } = await fomoLib();
    const ro = (await fomoApi(`/v2/users/${encodeURIComponent(uid)}/followers`)) as {
      users?: { id?: string }[];
    };
    return (ro.users ?? []).map((u) => String(u.id)).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Discover traders from our thesis feeds + followers, score them, follow the
 * strongest, and persist the ranked watch list. Returns a short report.
 */
export async function discoverAndFollow(maxFollow = 5): Promise<{
  enabled: boolean;
  evaluated: number;
  followed: number;
  tracked: number;
  top: { handle: string | null; score: number; followed: boolean }[];
  error?: string;
}> {
  const { fomoThesisEnabled, fomoCurrentUserId } = await fomoLib();
  if (!fomoThesisEnabled()) {
    return { enabled: false, evaluated: 0, followed: 0, tracked: trackedTraders().length, top: [] };
  }
  let uid = "";
  try {
    uid = await fomoCurrentUserId();
  } catch (e) {
    return {
      enabled: true,
      evaluated: 0,
      followed: 0,
      tracked: trackedTraders().length,
      top: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Candidate ids: thesis writers on tokens we trade + people who follow us.
  const candidateIds = new Set<string>();
  for (const token of (await ourTokens(uid)).slice(0, 10)) {
    for (const item of await thesisFeed(token)) {
      if (item.userId && item.userId !== uid) candidateIds.add(item.userId);
    }
    if (candidateIds.size >= 60) break;
  }
  for (const id of await ourFollowerIds(uid)) candidateIds.add(id);

  let evaluated = 0;
  const scored: { p: FomoProfile; score: number }[] = [];
  for (const id of candidateIds) {
    const p = await profile(id);
    if (!p || p.isRestricted || p.private) continue;
    evaluated += 1;
    const score = scoreTrader(p);
    scored.push({ p, score });
    upsertTrackedTrader({
      uuid: p.id,
      handle: p.userHandle ?? null,
      displayName: p.displayName ?? null,
      score: Number(score.toFixed(4)),
      numTrades: p.numTrades ?? 0,
      totalVolume: Math.round(p.totalVolume ?? 0),
      avgHoldS: p.averageHoldTimeSeconds ?? 0,
      followers: p.followers ?? 0,
      followed: isTrackedFollowed(p.id),
      note: p.followsCurrentUser ? "follows us" : null,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  let followed = 0;
  for (const { p, score } of scored) {
    if (followed >= maxFollow) break;
    if (score < 0.15) continue; // don't follow dead/empty accounts
    if (isTrackedFollowed(p.id)) continue;
    if (await follow(uid, p.id)) {
      followed += 1;
      upsertTrackedTrader({
        uuid: p.id,
        handle: p.userHandle ?? null,
        displayName: p.displayName ?? null,
        score: Number(score.toFixed(4)),
        numTrades: p.numTrades ?? 0,
        totalVolume: Math.round(p.totalVolume ?? 0),
        avgHoldS: p.averageHoldTimeSeconds ?? 0,
        followers: p.followers ?? 0,
        followed: true,
        note: p.followsCurrentUser ? "follows us" : null,
      });
    }
  }

  const list = trackedTraders(10);
  return {
    enabled: true,
    evaluated,
    followed,
    tracked: trackedTraders().length,
    top: list.map((t: TrackedTrader) => ({ handle: t.handle, score: t.score, followed: t.followed })),
  };
}

/**
 * Backfill theses for past fomo fills that never got one (e.g. the analyst
 * omitted the inline thesis). Generates a thesis per orphaned fill and queues
 * it for the feed. Idempotent: it only touches fills with no thesis row yet.
 */
export async function backfillFomoTheses(perAgent = 8): Promise<{
  agents: number;
  created: number;
}> {
  const { listActiveAgents, fillsFor, thesesFor, recordThesis } = await import("@/lib/trading/store");
  const { writeThesis } = await import("@/lib/trading/analyst");
  const agents = listActiveAgents().filter((a) => a.config?.venue === "fomo");
  let created = 0;
  let tokens: import("@/lib/market-data").ScreenerToken[] = [];
  for (const a of agents) {
    const fills = fillsFor(a.id, 30).filter((f) => f.txHash && f.txHash !== "paper");
    const haveTx = new Set(thesesFor(a.id, 100).map((t) => t.txHash).filter(Boolean));
    const missing = fills.filter((f) => !haveTx.has(f.txHash)).slice(0, perAgent);
    if (missing.length && tokens.length === 0) {
      try {
        const { solScreener } = await import("@/lib/trading/fomo-solana");
        tokens = await solScreener();
      } catch {
        /* proceed without live data — writeThesis still produces a thesis */
      }
    }
    for (const f of missing) {
      const t = tokens.find((x) => x.address === f.token);
      const thesis = await writeThesis({ side: f.side, symbol: f.symbol, reason: f.reason, token: t });
      recordThesis({
        agentId: a.id,
        token: f.token,
        symbol: f.symbol,
        side: f.side,
        venue: "fomo",
        thesis,
        txHash: f.txHash,
        valueUsd: f.valueUsd,
        priceUsd: f.priceUsd,
      });
      created += 1;
    }
  }
  return { agents: agents.length, created };
}
