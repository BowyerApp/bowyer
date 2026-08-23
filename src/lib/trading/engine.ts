/**
 * Trading engine — evaluates every active agent instance once per tick.
 *
 * Paper mode: fills at live screener prices with a realistic slippage
 * haircut, virtual bankroll tracked in trading_cash.
 *
 * Live mode: real v2 swaps from the instance's dedicated wallet. USDG is the
 * base currency; WETH-quoted pairs are reached by converting through the
 * canonical WETH/USDG pool. Live requires TRADING_WALLET_SECRET and mainnet.
 */

import { getMemeScreener, type ScreenerToken } from "@/lib/market-data";
import { ACTIVE_CHAIN } from "@/lib/chain";
import {
  briefError,
  cashFor,
  fillsFor,
  fillsToday,
  listActiveAgents,
  noteTick,
  positionsFor,
  recordFill,
  setCash,
  setPositionMeta,
  snapshotEquity,
  updateHighWater,
  type TradingAgentRow,
} from "@/lib/trading/store";
import { STRATEGIES, type Order } from "@/lib/trading/strategies";
import {
  USDG,
  USDG_DEC,
  WETH,
  erc20Balance,
  ethUsdSpot,
  findV2Pair,
  nativeBalance,
  pairReserves,
  swapV2Exact,
  tokenDecimals,
} from "@/lib/trading/dex";
import { liveTradingEnabled, loadAgentWallet } from "@/lib/trading/wallets";
import {
  hlAccountValueUsd,
  hlPlaceOrder,
  hlScreener,
  hlSymbolFromAddress,
  isHlToken,
} from "@/lib/trading/hyperliquid";

const MIN_GAS_WEI = BigInt(3e14); // 0.0003 ETH keeps ~15 swaps of headroom

function paperFillPrice(order: Order, token: ScreenerToken | undefined): number {
  const liq = token?.liquidityUsd ?? 50_000;
  const size = order.usd ?? (order.fraction ?? 1) * order.priceUsd;
  const impact = Math.min(0.05, size / Math.max(liq, 1_000));
  const drag = 0.003 + 0.005 + impact; // LP fee + spread + impact
  return order.side === "buy" ? order.priceUsd * (1 + drag) : order.priceUsd * (1 - drag);
}

async function executePaper(agent: TradingAgentRow, order: Order, token?: ScreenerToken) {
  const cash = cashFor(agent.id);
  const px = paperFillPrice(order, token);
  if (order.side === "buy") {
    const usd = Math.min(order.usd ?? 0, cash);
    if (usd < 10) return;
    const qty = usd / px;
    setCash(agent.id, cash - usd);
    recordFill({
      agentId: agent.id,
      side: "buy",
      token: order.token,
      symbol: order.symbol,
      qty,
      priceUsd: px,
      txHash: "paper",
      reason: order.reason,
    });
  } else {
    const pos = positionsFor(agent.id).find((p) => p.token === order.token);
    if (!pos) return;
    const qty = pos.qty * (order.fraction ?? 1);
    if (qty * px < 1) return;
    setCash(agent.id, cash + qty * px);
    recordFill({
      agentId: agent.id,
      side: "sell",
      token: order.token,
      symbol: order.symbol,
      qty,
      priceUsd: px,
      txHash: "paper",
      reason: order.reason,
    });
  }
  if (order.meta) setPositionMeta(agent.id, order.token, order.meta);
}

/** Live route: which quote does this token trade against on v2? */
async function liveRoute(token: string): Promise<{ quote: string; pair: string } | null> {
  const usdgPair = await findV2Pair(token, USDG);
  if (usdgPair) return { quote: USDG, pair: usdgPair.pair };
  const wethPair = await findV2Pair(token, WETH);
  if (wethPair) return { quote: WETH, pair: wethPair.pair };
  return null;
}

/** Live Hyperliquid perp execution — long-only, IOC market-like orders. */
async function executeLiveHl(agent: TradingAgentRow, order: Order) {
  const wallet = loadAgentWallet(agent.id);
  if (!wallet) throw new Error("agent wallet missing");
  const symbol = hlSymbolFromAddress(order.token);

  if (order.side === "buy") {
    const usd = order.usd ?? 0;
    if (usd < 10) return;
    const fill = await hlPlaceOrder({ account: wallet.account, symbol, isBuy: true, sizeUsd: usd });
    recordFill({
      agentId: agent.id,
      side: "buy",
      token: order.token,
      symbol: order.symbol,
      qty: fill.filledQty,
      priceUsd: fill.avgPriceUsd,
      txHash: fill.txHash,
      reason: order.reason,
    });
  } else {
    const pos = positionsFor(agent.id).find((p) => p.token === order.token);
    if (!pos) return;
    const qty = pos.qty * Math.min(1, Math.max(0, order.fraction ?? 1));
    const fill = await hlPlaceOrder({
      account: wallet.account,
      symbol,
      isBuy: false,
      sizeAsset: qty,
      reduceOnly: true,
    });
    recordFill({
      agentId: agent.id,
      side: "sell",
      token: order.token,
      symbol: order.symbol,
      qty: fill.filledQty,
      priceUsd: fill.avgPriceUsd,
      txHash: fill.txHash,
      reason: order.reason,
    });
  }
  if (order.meta) setPositionMeta(agent.id, order.token, order.meta);
}

async function executeLive(agent: TradingAgentRow, order: Order) {
  if (isHlToken(order.token)) return executeLiveHl(agent, order);

  const wallet = loadAgentWallet(agent.id);
  if (!wallet) throw new Error("agent wallet missing");

  const gas = await nativeBalance(wallet.address);
  if (gas < MIN_GAS_WEI) throw new Error("needs gas: send ~0.001 ETH to the agent wallet");

  const route = await liveRoute(order.token);
  if (!route) throw new Error(`no v2 route for ${order.symbol}`);

  // Reserve sanity: order must be < 2% of the pool's quote side.
  const info = await findV2Pair(order.token, route.quote);
  const { r0, r1 } = await pairReserves(route.pair);
  const quoteReserve = info!.token0 === route.quote ? r0 : r1;
  const quoteDec = route.quote === USDG ? USDG_DEC : 18;
  const ethUsd = route.quote === WETH ? await ethUsdSpot() : 1;
  const quoteReserveUsd = (Number(quoteReserve) / 10 ** quoteDec) * ethUsd;

  const tokenDec = await tokenDecimals(order.token);

  if (order.side === "buy") {
    const usd = order.usd ?? 0;
    if (usd < 10) return;
    if (usd > quoteReserveUsd * 0.02) throw new Error("order too large for pool depth");

    let quoteAmount: bigint;
    if (route.quote === USDG) {
      quoteAmount = BigInt(Math.round(usd * 10 ** USDG_DEC));
      const bal = await erc20Balance(USDG, wallet.address);
      if (bal < quoteAmount) throw new Error("insufficient USDG in agent wallet");
    } else {
      // Convert the clip to WETH through the canonical pool first.
      const usdgIn = BigInt(Math.round(usd * 10 ** USDG_DEC));
      const bal = await erc20Balance(USDG, wallet.address);
      if (bal < usdgIn) throw new Error("insufficient USDG in agent wallet");
      const conv = await swapV2Exact({
        account: wallet.account,
        tokenIn: USDG,
        tokenOut: WETH,
        amountIn: usdgIn,
      });
      quoteAmount = conv.amountOut;
    }

    const swap = await swapV2Exact({
      account: wallet.account,
      tokenIn: route.quote,
      tokenOut: order.token,
      amountIn: quoteAmount,
    });
    const qty = Number(swap.amountOut) / 10 ** tokenDec;
    if (qty <= 0) throw new Error("zero output");
    recordFill({
      agentId: agent.id,
      side: "buy",
      token: order.token,
      symbol: order.symbol,
      qty,
      priceUsd: usd / qty,
      txHash: swap.txHash,
      reason: order.reason,
    });
  } else {
    const pos = positionsFor(agent.id).find((p) => p.token === order.token);
    if (!pos) return;
    const balance = await erc20Balance(order.token, wallet.address);
    const fraction = Math.min(1, Math.max(0, order.fraction ?? 1));
    const amountIn =
      fraction >= 0.999 ? balance : (balance * BigInt(Math.round(fraction * 1e6))) / BigInt(1e6);
    if (amountIn === BigInt(0)) return;

    const swap = await swapV2Exact({
      account: wallet.account,
      tokenIn: order.token,
      tokenOut: route.quote,
      amountIn,
    });
    const outUsd =
      route.quote === USDG
        ? Number(swap.amountOut) / 10 ** USDG_DEC
        : (Number(swap.amountOut) / 1e18) * ethUsd;
    const qty = Number(amountIn) / 10 ** tokenDec;
    recordFill({
      agentId: agent.id,
      side: "sell",
      token: order.token,
      symbol: order.symbol,
      qty,
      priceUsd: qty > 0 ? outUsd / qty : order.priceUsd,
      txHash: swap.txHash,
      reason: order.reason,
    });
  }
  if (order.meta) setPositionMeta(agent.id, order.token, order.meta);
}

/** Market-sell every open position (owner-triggered flatten). Returns fills executed. */
export async function closeAllPositions(agent: TradingAgentRow, reason: string): Promise<number> {
  const tokens =
    agent.config.venue === "hyperliquid" ? await hlScreener() : (await getMemeScreener()).tokens;
  const priceOf = new Map(tokens.map((t) => [t.address.toLowerCase(), t.priceUsd ?? null]));
  let closed = 0;
  for (const pos of positionsFor(agent.id)) {
    const order: Order = {
      side: "sell",
      token: pos.token,
      symbol: pos.symbol,
      fraction: 1,
      priceUsd: priceOf.get(pos.token) ?? pos.avgCostUsd,
      reason,
    };
    try {
      if (agent.mode === "paper") {
        await executePaper(agent, order, tokens.find((t) => t.address.toLowerCase() === pos.token));
      } else {
        await executeLive(agent, order);
      }
      closed += 1;
    } catch (err) {
      console.error(`[trading] flatten failed for ${pos.symbol}:`, (err as Error).message);
    }
  }
  if (closed > 0) {
    noteTick(agent.id, `flattened ${closed} position(s) — ${reason}`);
    try {
      const { notifyTradeFill } = await import("@/lib/telegram");
      const { STRATEGY_META } = await import("@/lib/trading/store");
      for (const fill of fillsFor(agent.id, closed)) {
        await notifyTradeFill({
          owner: agent.owner,
          strategyName: STRATEGY_META[agent.strategy].name,
          mode: agent.mode,
          side: fill.side,
          symbol: fill.symbol,
          valueUsd: fill.valueUsd,
          priceUsd: fill.priceUsd,
          reason: fill.reason,
          txHash: fill.txHash,
        }).catch(() => {});
      }
    } catch {
      /* receipts are best-effort */
    }
  }
  return closed;
}

export async function liveEquityUsd(agentId: string, tokens: ScreenerToken[]): Promise<number> {
  const wallet = loadAgentWallet(agentId);
  if (!wallet) return 0;
  const [usdg, weth, ethUsd] = await Promise.all([
    erc20Balance(USDG, wallet.address),
    erc20Balance(WETH, wallet.address),
    ethUsdSpot(),
  ]);
  let equity = Number(usdg) / 10 ** USDG_DEC + (Number(weth) / 1e18) * ethUsd;
  const priceOf = new Map(tokens.map((t) => [t.address.toLowerCase(), t.priceUsd ?? 0]));
  for (const pos of positionsFor(agentId)) {
    equity += pos.qty * (priceOf.get(pos.token) ?? pos.avgCostUsd);
  }
  return equity;
}

async function tickAgent(agent: TradingAgentRow, tokens: ScreenerToken[]) {
  const positions = positionsFor(agent.id);

  // Refresh trailing high-water marks before deciding.
  const priceOf = new Map(tokens.map((t) => [t.address.toLowerCase(), t.priceUsd ?? null]));
  for (const pos of positions) {
    const px = priceOf.get(pos.token);
    if (px) updateHighWater(agent.id, pos.token, px);
  }

  let cashUsd: number;
  if (agent.mode === "paper") {
    cashUsd = cashFor(agent.id);
  } else if (agent.config.venue === "hyperliquid") {
    const wallet = loadAgentWallet(agent.id);
    if (!wallet) {
      noteTick(agent.id, "live wallet missing — recreate the agent");
      return;
    }
    const accountValue = await hlAccountValueUsd(wallet.address);
    const positionNotional = positions.reduce((sum, p) => {
      const px = priceOf.get(p.token) ?? p.avgCostUsd;
      return sum + p.qty * (px ?? p.avgCostUsd);
    }, 0);
    cashUsd = Math.max(0, accountValue - positionNotional);
    if (accountValue < 10 && positions.length === 0) {
      noteTick(agent.id, "fund the agent on Hyperliquid: send USDC (Arbitrum) to its wallet, then deposit on app.hyperliquid.xyz");
      return;
    }
  } else {
    const wallet = loadAgentWallet(agent.id);
    if (!wallet) {
      noteTick(agent.id, "live wallet missing — recreate the agent");
      return;
    }
    const [usdg, weth, ethUsd] = await Promise.all([
      erc20Balance(USDG, wallet.address),
      erc20Balance(WETH, wallet.address),
      ethUsdSpot(),
    ]);
    cashUsd = Number(usdg) / 10 ** USDG_DEC + (Number(weth) / 1e18) * ethUsd;
  }

  const done = fillsToday(agent.id);
  const remaining = agent.config.dailyTradeCap - done;
  const input = {
    agent,
    tokens,
    positions: positionsFor(agent.id),
    cashUsd,
    fillsToday: done,
  };
  const orders = (await STRATEGIES[agent.strategy](input)).slice(0, Math.max(0, remaining));

  let executed = 0;
  let lastError: string | null = null;
  for (const order of orders) {
    try {
      if (agent.mode === "paper") {
        await executePaper(agent, order, tokens.find((t) => t.address.toLowerCase() === order.token));
      } else {
        await executeLive(agent, order);
      }
      executed += 1;
    } catch (err) {
      lastError = briefError(err);
      console.error(`[trading] ${agent.strategy}/${agent.id.slice(0, 8)} order failed:`, lastError);
    }
  }

  // Fill alerts to the owner's linked Telegram — never blocks the tick.
  if (executed > 0) {
    try {
      const { notifyTradeFill } = await import("@/lib/telegram");
      const { STRATEGY_META } = await import("@/lib/trading/store");
      for (const fill of fillsFor(agent.id, executed)) {
        await notifyTradeFill({
          owner: agent.owner,
          strategyName: STRATEGY_META[agent.strategy].name,
          mode: agent.mode,
          side: fill.side,
          symbol: fill.symbol,
          valueUsd: fill.valueUsd,
          priceUsd: fill.priceUsd,
          reason: fill.reason,
          txHash: fill.txHash,
        }).catch(() => {});
      }
    } catch {
      /* alerts are best-effort */
    }
  }

  // Equity snapshot + status note.
  const equity =
    agent.mode === "paper"
      ? cashFor(agent.id) +
        positionsFor(agent.id).reduce(
          (sum, p) => sum + p.qty * (priceOf.get(p.token) ?? p.avgCostUsd),
          0
        )
      : await liveEquityUsd(agent.id, tokens);
  snapshotEquity(agent.id, equity);

  const openCount = positionsFor(agent.id).length;
  if (lastError) {
    noteTick(agent.id, `error: ${lastError}`);
  } else if (executed > 0) {
    const last = fillsFor(agent.id, 1)[0];
    noteTick(agent.id, `${last?.side ?? "traded"} ${last?.symbol ?? ""} — ${last?.reason ?? ""}`);
  } else if (remaining <= 0) {
    noteTick(agent.id, `daily trade cap reached (${agent.config.dailyTradeCap})`);
  } else {
    noteTick(
      agent.id,
      `no signal — ${tokens.length} tokens screened, ${openCount} open, $${equity.toFixed(0)} equity`
    );
  }
}

let ticking = false;

export async function tradingTick(): Promise<{ agents: number; errors: number }> {
  if (ticking) return { agents: 0, errors: 0 };
  ticking = true;
  try {
    const agents = listActiveAgents();
    if (agents.length === 0) return { agents: 0, errors: 0 };
    const { tokens } = await getMemeScreener();

    // One shared Hyperliquid snapshot per tick, only when someone trades there.
    let hlTokens: ScreenerToken[] | null = null;
    if (agents.some((a) => a.config.venue === "hyperliquid")) {
      try {
        hlTokens = await hlScreener();
      } catch (err) {
        console.error("[trading] hyperliquid screener failed:", (err as Error).message);
      }
    }

    let errors = 0;
    for (const agent of agents) {
      const onHl = agent.config.venue === "hyperliquid";
      if (agent.mode === "live" && !liveTradingEnabled()) {
        noteTick(agent.id, "live trading disabled on this server");
        continue;
      }
      if (agent.mode === "live" && !onHl && ACTIVE_CHAIN.chainIdDecimal !== 4663) {
        noteTick(agent.id, "live trading disabled on this server");
        continue;
      }
      if (onHl && !hlTokens) {
        noteTick(agent.id, "hyperliquid data unavailable this tick");
        continue;
      }
      try {
        await tickAgent(agent, onHl ? hlTokens! : tokens);
      } catch (err) {
        errors += 1;
        console.error(`[trading] tick failed for ${agent.id.slice(0, 8)}:`, err);
        noteTick(agent.id, `tick error: ${briefError(err)}`);
      }
    }
    return { agents: agents.length, errors };
  } finally {
    ticking = false;
  }
}

let engineHandle: ReturnType<typeof setInterval> | null = null;

export function startTradingEngine(): void {
  if (engineHandle || process.env.TRADING_DISABLED === "1") return;
  engineHandle = setInterval(() => {
    tradingTick().catch((err) => console.error("[trading] tick crashed:", err));
  }, 60_000);
  setTimeout(() => {
    tradingTick().catch((err) => console.error("[trading] first tick crashed:", err));
  }, 20_000);
  console.log("[trading] engine started (60s tick)");
}
