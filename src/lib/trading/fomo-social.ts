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
 *  - discoverAndFollow(): gather traders from live Solana + RHC thesis feeds
 *    and our social graph, reconstruct realized performance from swap history,
 *    follow only accounts with proven positive expectancy, and persist the
 *    ranked smart-money list used by the analyst.
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
const RHC_NETWORK_ID = 4663;
const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface TokenFeedRef {
  address: string;
  networkId: number;
}

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
  inHumanAmount?: number;
  outHumanAmount?: number;
  humanUsdAmountIn?: number;
  humanUsdAmountOut?: number;
  createdAt?: string;
}

interface TraderPerformance {
  realizedPnlUsd: number;
  realizedRoi: number;
  winRate: number;
  roundTrips: number;
}

interface TraderOpenPerformance {
  openPnlUsd: number;
  openCostBasisUsd: number;
  openRoi: number;
  openPositions: number;
}

interface FomoClosedTrade {
  trade?: {
    realizedPnlUsd?: number;
    totalCostBasis?: number;
    closedAt?: string;
    networkId?: number;
  };
}

interface FomoTopHolder {
  user?: FomoProfile;
  unrealizedPnl?: number;
  costBasis?: number;
}

interface FomoTopHoldersResult {
  topHolders?: FomoTopHolder[];
}

function commentText(item: ThesisFeedItem): string {
  const c = item.comment;
  if (!c) return "";
  return (typeof c === "string" ? c : c.comment ?? "").trim();
}

/** Tokens we've actually traded on Solana or RHC — the feeds most relevant to us. */
async function ourTokens(uid: string): Promise<TokenFeedRef[]> {
  try {
    const { fomoApi } = await fomoLib();
    const ro = (await fomoApi(`/v2/users/${encodeURIComponent(uid)}/swaps`)) as
      | FomoSwap[]
      | { items?: FomoSwap[]; swaps?: FomoSwap[] };
    const swaps = Array.isArray(ro) ? ro : (ro.items ?? ro.swaps ?? []);
    const tokens = new Map<string, TokenFeedRef>();
    for (const s of swaps) {
      if (!s.outTokenAddress || s.outTokenAddress === SOLANA_USDC) continue;
      const networkId = Number(s.outNetworkId);
      if (networkId !== SOLANA_NETWORK_ID && networkId !== RHC_NETWORK_ID) continue;
      const address = networkId === RHC_NETWORK_ID ? s.outTokenAddress.toLowerCase() : s.outTokenAddress;
      tokens.set(`${networkId}:${address}`, { address, networkId });
    }
    return [...tokens.values()];
  } catch {
    return [];
  }
}

async function thesisFeed(token: TokenFeedRef): Promise<ThesisFeedItem[]> {
  try {
    const { fomoApi } = await fomoLib();
    const qs = new URLSearchParams({
      tokenAddress: token.address,
      networkId: String(token.networkId),
    });
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

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function activityScore(p: FomoProfile): number {
  const trades = Math.min(p.numTrades ?? 0, 250) / 250; // activity
  const volume = Math.min(p.totalVolume ?? 0, 100_000) / 100_000; // conviction/size
  const audience = Math.min(p.followers ?? 0, 500) / 500; // social proof
  // Prefer real swing/position holds (10 min .. 3 days); punish scalp-bots and dead accounts.
  const hold = p.averageHoldTimeSeconds ?? 0;
  const holdScore = hold >= 600 && hold <= 259_200 ? 1 : hold > 0 ? 0.4 : 0;
  return trades * 0.4 + volume * 0.3 + audience * 0.15 + holdScore * 0.15;
}

/**
 * Reconstruct realized PnL from the latest fomo swaps. Fomo settles both
 * Solana and RHC exits back into Solana USDC, so a weighted-average cost book
 * gives us an honest profit signal instead of mistaking volume for skill.
 */
function performanceFromSwaps(swaps: FomoSwap[]): TraderPerformance {
  const books = new Map<string, { qty: number; costUsd: number }>();
  let realizedPnlUsd = 0;
  let realizedCostUsd = 0;
  let wins = 0;
  let roundTrips = 0;
  const ordered = [...swaps].sort(
    (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
  );

  for (const s of ordered) {
    const inToken = String(s.inTokenAddress ?? "");
    const outToken = String(s.outTokenAddress ?? "");
    if (!inToken || !outToken) continue;
    if (inToken === SOLANA_USDC && outToken !== SOLANA_USDC) {
      const qty = Number(s.outHumanAmount ?? 0);
      const costUsd = Number(s.inHumanAmount ?? s.humanUsdAmountIn ?? 0);
      if (!(qty > 0 && costUsd > 0)) continue;
      const key = outToken.toLowerCase();
      const book = books.get(key) ?? { qty: 0, costUsd: 0 };
      book.qty += qty;
      book.costUsd += costUsd;
      books.set(key, book);
      continue;
    }
    if (outToken === SOLANA_USDC && inToken !== SOLANA_USDC) {
      const soldQty = Number(s.inHumanAmount ?? 0);
      const proceedsUsd = Number(s.outHumanAmount ?? s.humanUsdAmountOut ?? 0);
      const book = books.get(inToken.toLowerCase());
      if (!book || !(soldQty > 0 && proceedsUsd > 0) || book.qty <= 0) continue;
      const matchedQty = Math.min(soldQty, book.qty);
      const matchedCost = book.costUsd * (matchedQty / book.qty);
      const matchedProceeds = proceedsUsd * (matchedQty / soldQty);
      const pnl = matchedProceeds - matchedCost;
      realizedPnlUsd += pnl;
      realizedCostUsd += matchedCost;
      roundTrips += 1;
      if (pnl > 0) wins += 1;
      book.qty -= matchedQty;
      book.costUsd -= matchedCost;
      if (book.qty <= 1e-12) books.delete(inToken.toLowerCase());
    }
  }

  return {
    realizedPnlUsd,
    realizedRoi: realizedCostUsd > 0 ? realizedPnlUsd / realizedCostUsd : 0,
    winRate: roundTrips > 0 ? wins / roundTrips : 0,
    roundTrips,
  };
}

async function traderPerformance(uuid: string): Promise<TraderPerformance> {
  try {
    const { fomoApi } = await fomoLib();
    // This is fomo's own closed-trade ledger: exact realized PnL and cost
    // basis, including RHC. Prefer it over reconstructing from raw swaps.
    const trades = (await fomoApi(
      `/trades?userId=${encodeURIComponent(uuid)}&orderBy=closedAt`
    )) as { closedTrades?: FomoClosedTrade[] };
    const closed = (trades.closedTrades ?? [])
      .map((row) => row.trade)
      .filter(
        (trade): trade is NonNullable<FomoClosedTrade["trade"]> =>
          Boolean(trade) &&
          Number.isFinite(Number(trade?.realizedPnlUsd)) &&
          Number(trade?.totalCostBasis) > 0
      );
    if (closed.length > 0) {
      const realizedPnlUsd = closed.reduce((sum, trade) => sum + Number(trade.realizedPnlUsd), 0);
      const realizedCostUsd = closed.reduce((sum, trade) => sum + Number(trade.totalCostBasis), 0);
      const wins = closed.filter((trade) => Number(trade.realizedPnlUsd) > 0).length;
      return {
        realizedPnlUsd,
        realizedRoi: realizedCostUsd > 0 ? realizedPnlUsd / realizedCostUsd : 0,
        winRate: wins / closed.length,
        roundTrips: closed.length,
      };
    }

    // Fallback for profiles whose closed-trade endpoint is empty.
    const ro = (await fomoApi(`/v2/users/${encodeURIComponent(uuid)}/swaps`)) as
      | FomoSwap[]
      | { items?: FomoSwap[]; swaps?: FomoSwap[] };
    return performanceFromSwaps(Array.isArray(ro) ? ro : (ro.items ?? ro.swaps ?? []));
  } catch {
    return { realizedPnlUsd: 0, realizedRoi: 0, winRate: 0, roundTrips: 0 };
  }
}

function closedPerformanceScore(perf: TraderPerformance): number {
  const sample = Math.min(1, perf.roundTrips / 10);
  const roiScore = clamp01((perf.realizedRoi + 0.05) / 0.45);
  const winScore = clamp01((perf.winRate - 0.35) / 0.4);
  const pnlScore = clamp01(Math.log10(Math.max(1, perf.realizedPnlUsd + 1)) / 3);
  return (roiScore * 0.55 + winScore * 0.3 + pnlScore * 0.15) * sample;
}

function openPerformanceScore(open: TraderOpenPerformance): number {
  if (open.openPositions === 0 || open.openCostBasisUsd <= 0) return 0;
  const roiScore = clamp01((open.openRoi + 0.05) / 1.05);
  const pnlScore = clamp01(Math.log10(Math.max(1, open.openPnlUsd + 1)) / 5);
  // One live winner is useful evidence, but several profitable open positions
  // deserve more confidence than one potentially temporary mark-to-market spike.
  const sample = 0.5 + 0.5 * Math.min(1, open.openPositions / 3);
  return (roiScore * 0.7 + pnlScore * 0.3) * sample;
}

function scoreTrader(
  p: FomoProfile,
  perf?: TraderPerformance,
  open?: TraderOpenPerformance
): number {
  const activity = activityScore(p);
  const hasClosed = Boolean(perf && perf.roundTrips >= 2);
  const hasOpen = Boolean(open && open.openPositions > 0 && open.openCostBasisUsd > 0);
  if (hasClosed && hasOpen) {
    return closedPerformanceScore(perf!) * 0.6 + openPerformanceScore(open!) * 0.2 + activity * 0.2;
  }
  if (hasClosed) return closedPerformanceScore(perf!) * 0.75 + activity * 0.25;
  if (hasOpen) return openPerformanceScore(open!) * 0.7 + activity * 0.3;
  return activity * 0.3;
}

function performanceNote(
  p: FomoProfile,
  perf?: TraderPerformance,
  open?: TraderOpenPerformance
): string | null {
  const prefix = p.followsCurrentUser ? "follows us; " : "";
  const parts: string[] = [];
  if (perf && perf.roundTrips > 0) {
    const pnl = `${perf.realizedPnlUsd >= 0 ? "+" : ""}$${perf.realizedPnlUsd.toFixed(0)}`;
    parts.push(
      `${perf.roundTrips} exits, ${(perf.winRate * 100).toFixed(0)}% wins, ${pnl}, ${(perf.realizedRoi * 100).toFixed(1)}% realized ROI`
    );
  }
  if (open && open.openPositions > 0) {
    const pnl = `${open.openPnlUsd >= 0 ? "+" : ""}$${open.openPnlUsd.toFixed(0)}`;
    parts.push(
      `${open.openPositions} open, ${pnl} unrealized, ${(open.openRoi * 100).toFixed(1)}% open ROI`
    );
  }
  if (parts.length === 0) return prefix ? prefix.slice(0, -2) : null;
  return `${prefix}${parts.join("; ")}`;
}

/** Broaden discovery beyond our own book: scan live trending feeds on both chains. */
async function discoveryTokens(): Promise<TokenFeedRef[]> {
  const refs = new Map<string, TokenFeedRef>();
  try {
    const { solScreener } = await import("@/lib/trading/fomo-solana");
    for (const t of (await solScreener(12)).slice(0, 12)) {
      refs.set(`${SOLANA_NETWORK_ID}:${t.address}`, {
        address: t.address,
        networkId: SOLANA_NETWORK_ID,
      });
    }
  } catch {
    /* RHC and own-trade feeds can still discover candidates */
  }
  try {
    const { fomoRhcScreener } = await import("@/lib/trading/fomo-market");
    const rows = (await fomoRhcScreener())
      .filter((t) => t.priceUsd && (t.liquidityUsd ?? 0) >= 10_000)
      .slice(0, 20);
    for (const t of rows) {
      refs.set(`${RHC_NETWORK_ID}:${t.address.toLowerCase()}`, {
        address: t.address.toLowerCase(),
        networkId: RHC_NETWORK_ID,
      });
    }
  } catch {
    /* Solana and own-trade feeds can still discover candidates */
  }
  return [...refs.values()];
}

/**
 * Fomo exposes the actual top holders of a set of tokens, including the user
 * attached to each profitable position. This is a much better discovery pool
 * than follower count: it finds the people already winning in today's RHC and
 * Solana tape, then traderPerformance() verifies their closed record.
 */
async function topHolderDiscovery(tokens: TokenFeedRef[]): Promise<{
  profiles: FomoProfile[];
  openById: Map<string, TraderOpenPerformance>;
}> {
  const found = new Map<string, FomoProfile>();
  const openById = new Map<string, TraderOpenPerformance>();
  const { fomoApi } = await fomoLib();
  for (let i = 0; i < tokens.length; i += 8) {
    const chunk = tokens.slice(i, i + 8).map((token) => ({
      address: token.address,
      networkId: token.networkId,
    }));
    try {
      const query = encodeURIComponent(JSON.stringify(chunk));
      const ro = (await fomoApi(`/hodlers/top?tokens=${query}`)) as FomoTopHoldersResult[];
      for (const tokenResult of Array.isArray(ro) ? ro : []) {
        for (const holder of tokenResult.topHolders ?? []) {
          const user = holder.user;
          if (!user?.id || user.isRestricted || user.private) continue;
          found.set(user.id, user);
          const pnl = Number(holder.unrealizedPnl ?? 0);
          const cost = Number(holder.costBasis ?? 0);
          if (!Number.isFinite(pnl) || !Number.isFinite(cost) || cost <= 0) continue;
          const current = openById.get(user.id) ?? {
            openPnlUsd: 0,
            openCostBasisUsd: 0,
            openRoi: 0,
            openPositions: 0,
          };
          current.openPnlUsd += pnl;
          current.openCostBasisUsd += cost;
          current.openPositions += 1;
          current.openRoi = current.openPnlUsd / current.openCostBasisUsd;
          openById.set(user.id, current);
        }
      }
    } catch {
      /* other token batches can still contribute candidates */
    }
  }
  return { profiles: [...found.values()], openById };
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
export async function discoverAndFollow(maxFollow = 12): Promise<{
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

  // Candidate ids: writers and top holders on our trades AND today's live
  // Solana/RHC tape, plus our followers and existing tracked set. This breaks
  // the old self-reinforcing loop where six follows were the entire pool.
  const candidateIds = new Set<string>();
  const feedRefs = new Map<string, TokenFeedRef>();
  for (const token of [...(await ourTokens(uid)), ...(await discoveryTokens())]) {
    feedRefs.set(`${token.networkId}:${token.address}`, token);
  }
  // Top holders go first so a noisy thesis feed cannot crowd proven on-chain
  // participants out of the bounded evaluation set.
  const holderDiscovery = await topHolderDiscovery([...feedRefs.values()].slice(0, 32));
  const holderProfiles = holderDiscovery.profiles;
  const openById = holderDiscovery.openById;
  const profileHints = new Map(holderProfiles.map((p) => [p.id, p]));
  for (const p of holderProfiles) candidateIds.add(p.id);
  for (const token of [...feedRefs.values()].slice(0, 32)) {
    for (const item of await thesisFeed(token)) {
      if (item.userId && item.userId !== uid) candidateIds.add(item.userId);
    }
    if (candidateIds.size >= 120) break;
  }
  const followers = await ourFollowerIds(uid);
  for (const id of [...followers, ...trackedTraders(100).map((t) => t.uuid)]) {
    if (id !== uid) candidateIds.add(id);
  }

  let evaluated = 0;
  const profiles: FomoProfile[] = [];
  const ids = [...candidateIds].slice(0, 120);
  for (let i = 0; i < ids.length; i += 8) {
    const batch = await Promise.all(
      ids.slice(i, i + 8).map((id) => profileHints.get(id) ?? profile(id))
    );
    for (const p of batch) {
      if (p && !p.isRestricted && !p.private) profiles.push(p);
    }
  }

  // Pull swap history for the strongest active candidates and rank them on
  // realized results. API work stays bounded so the publish cron cannot time out.
  const performanceById = new Map<string, TraderPerformance>();
  const performanceCandidates = [...profiles]
    .sort(
      (a, b) =>
        openPerformanceScore(openById.get(b.id) ?? {
          openPnlUsd: 0,
          openCostBasisUsd: 0,
          openRoi: 0,
          openPositions: 0,
        }) +
        activityScore(b) -
        (openPerformanceScore(openById.get(a.id) ?? {
          openPnlUsd: 0,
          openCostBasisUsd: 0,
          openRoi: 0,
          openPositions: 0,
        }) +
          activityScore(a))
    )
    .slice(0, 48);
  for (let i = 0; i < performanceCandidates.length; i += 6) {
    const batch = performanceCandidates.slice(i, i + 6);
    const results = await Promise.all(batch.map((p) => traderPerformance(p.id)));
    batch.forEach((p, index) => performanceById.set(p.id, results[index]));
  }

  const scored: {
    p: FomoProfile;
    score: number;
    perf?: TraderPerformance;
    open?: TraderOpenPerformance;
  }[] = [];
  for (const p of profiles) {
    evaluated += 1;
    const perf = performanceById.get(p.id);
    const open = openById.get(p.id);
    const score = scoreTrader(p, perf, open);
    scored.push({ p, score, perf, open });
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
      note: performanceNote(p, perf, open),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  let followed = 0;
  for (const { p, score, perf, open } of scored) {
    if (followed >= maxFollow) break;
    const closedProven = Boolean(
      perf &&
        perf.roundTrips >= 5 &&
        perf.realizedPnlUsd > 0 &&
        perf.realizedRoi >= 0.05 &&
        (perf.winRate >= 0.4 || perf.realizedRoi >= 0.25)
    );
    const openProven = Boolean(
      open &&
        ((open.openPositions >= 2 && open.openPnlUsd >= 1_000 && open.openRoi >= 0.2) ||
          (open.openPositions >= 1 && open.openPnlUsd >= 10_000 && open.openRoi >= 0.5))
    );
    if ((!closedProven && !openProven) || score < 0.35) continue;
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
        note: performanceNote(p, perf, open),
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
