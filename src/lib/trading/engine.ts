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
import { liveTradingEnabled, loadAgentSolanaWallet, loadAgentWallet } from "@/lib/trading/wallets";
import {
  hlAccountValueUsd,
  hlPlaceOrder,
  hlScreener,
  hlSymbolFromAddress,
  isHlToken,
} from "@/lib/trading/hyperliquid";
import {
  USDC_DECIMALS,
  USDC_MINT,
  canonicalMint,
  fomoSolanaAddress,
  fomoSolanaEnabled,
  fomoSolanaSwap,
  solScreener,
  solTokensByMint,
  splBalance,
  tokenDecimalsSolana,
} from "@/lib/trading/fomo-solana";

const MIN_GAS_WEI = BigInt(3e14); // 0.0003 ETH keeps ~15 swaps of headroom

/**
 * Address key for position/price matching. EVM (0x…) and Hyperliquid (hl:…)
 * addresses are lowercased (screener already emits them lowercase); Solana
 * mints are base58 and case-sensitive, so they must be left untouched.
 */
function addrKey(address: string): string {
  return address.startsWith("0x") || address.startsWith("hl:") ? address.toLowerCase() : address;
}

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

/**
 * Resolve the Solana wallet an agent trades with. Store-deployed agents carry
 * their own AES-encrypted per-agent wallet; the house agent (provisioned
 * before per-agent wallets existed) falls back to the shared env wallet.
 */
function fomoWalletFor(agent: TradingAgentRow): {
  address: string;
  signer?: { address: string; secretKey: Uint8Array };
} | null {
  const perAgent = loadAgentSolanaWallet(agent.id);
  if (perAgent) {
    return { address: perAgent.address, signer: { address: perAgent.address, secretKey: perAgent.secretKey } };
  }
  const envAddr = fomoSolanaAddress();
  return envAddr ? { address: envAddr } : null;
}

/**
 * Live fomo (Solana spot) execution — gasless via Jupiter Ultra. USDC is the
 * base currency; the agent's wallet signs its own taker slot, and Jupiter's
 * relayer pays the network fee, so the wallet never needs SOL.
 */
async function executeLiveFomo(agent: TradingAgentRow, order: Order) {
  const w = fomoWalletFor(agent);
  if (!w) throw new Error("no Solana wallet for this agent — fomo trading disabled");
  const address = w.address;

  // The store lowercases token keys, but Solana mints are case-sensitive
  // base58 — recover the true case or the RPC/Jupiter reject the mint and
  // exits (stops, trails) can never fill.
  const mint = canonicalMint(order.token);

  if (order.side === "buy") {
    const usd = order.usd ?? 0;
    if (usd < 5) return;
    const amountRaw = BigInt(Math.round(usd * 10 ** USDC_DECIMALS)).toString();
    const res = await fomoSolanaSwap({ inputMint: USDC_MINT, outputMint: mint, amountRaw, signer: w.signer });
    const dec = await tokenDecimalsSolana(mint);
    const qty = Number(res.outAmount) / 10 ** dec;
    if (qty <= 0) throw new Error("zero output");
    recordFill({
      agentId: agent.id,
      side: "buy",
      token: order.token,
      symbol: order.symbol,
      qty,
      priceUsd: usd / qty,
      txHash: res.txid,
      reason: order.reason,
    });
  } else {
    const pos = positionsFor(agent.id).find((p) => p.token === order.token);
    if (!pos) {
      console.warn(`[trading] fomo sell ${order.symbol}: no stored position for ${order.token}`);
      return;
    }
    const dec = await tokenDecimalsSolana(mint);
    const onChain = await splBalance(address, mint);
    const fraction = Math.min(1, Math.max(0, order.fraction ?? 1));
    const sellQty = Math.min(onChain, pos.qty * fraction);
    if (sellQty <= 0) {
      console.warn(
        `[trading] fomo sell ${order.symbol}: zero sellable qty (on-chain ${onChain}, stored ${pos.qty}, mint ${mint})`
      );
      return;
    }
    const amountRaw = BigInt(Math.floor(sellQty * 10 ** dec)).toString();
    const res = await fomoSolanaSwap({ inputMint: mint, outputMint: USDC_MINT, amountRaw, signer: w.signer });
    const outUsd = Number(res.outAmount) / 10 ** USDC_DECIMALS;
    recordFill({
      agentId: agent.id,
      side: "sell",
      token: order.token,
      symbol: order.symbol,
      qty: sellQty,
      priceUsd: sellQty > 0 ? outUsd / sellQty : order.priceUsd,
      txHash: res.txid,
      reason: order.reason,
    });
  }
  if (order.meta) setPositionMeta(agent.id, order.token, order.meta);
}

async function executeLive(agent: TradingAgentRow, order: Order) {
  if (agent.config.venue === "fomo") return executeLiveFomo(agent, order);
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
    agent.config.venue === "hyperliquid"
      ? await hlScreener()
      : agent.config.venue === "fomo"
        ? await solScreener()
        : (await getMemeScreener()).tokens;
  const priceOf = new Map(tokens.map((t) => [addrKey(t.address), t.priceUsd ?? null]));
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
        await executePaper(agent, order, tokens.find((t) => addrKey(t.address) === pos.token));
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
          venue: agent.config.venue ?? "rhc",
        }).catch(() => {});
      }
    } catch {
      /* receipts are best-effort */
    }
  }
  return closed;
}

/** fomo (Solana) live equity: on-chain USDC cash + open positions at screener price. */
export async function fomoEquityUsd(agentId: string, tokens: ScreenerToken[]): Promise<number> {
  const address = loadAgentSolanaWallet(agentId)?.address ?? fomoSolanaAddress();
  if (!address) return 0;
  const usdc = await splBalance(address, USDC_MINT);
  let equity = usdc;
  const priceOf = new Map(tokens.map((t) => [t.address, t.priceUsd ?? 0]));
  for (const pos of positionsFor(agentId)) {
    equity += pos.qty * (priceOf.get(pos.token) ?? pos.avgCostUsd);
  }
  return equity;
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
  const priceOf = new Map(tokens.map((t) => [addrKey(t.address), t.priceUsd ?? 0]));
  for (const pos of positionsFor(agentId)) {
    equity += pos.qty * (priceOf.get(pos.token) ?? pos.avgCostUsd);
  }
  return equity;
}

async function tickAgent(agent: TradingAgentRow, tokens: ScreenerToken[]) {
  const positions = positionsFor(agent.id);

  const priceOf = new Map(tokens.map((t) => [addrKey(t.address), t.priceUsd ?? null]));

  // A held token that fell off the screener MUST still be priced: dumping
  // names drop out of the top-traded lists first, and an unpriced position is
  // invisible to stop-losses and shows as break-even to the analyst. Fetch
  // them individually so exits always work.
  if (agent.config.venue === "fomo") {
    const missing = positions.filter((p) => !priceOf.get(p.token));
    if (missing.length > 0) {
      try {
        const extra = await solTokensByMint(missing.map((p) => ({ mint: p.token, symbol: p.symbol })));
        if (extra.length > 0) {
          tokens = tokens.concat(extra);
          for (const t of extra) priceOf.set(addrKey(t.address), t.priceUsd ?? null);
        }
        console.log(
          `[trading] off-screener pricing for ${agent.id.slice(0, 8)}: needed ${missing.map((p) => p.symbol).join(",")}; priced ${extra.map((t) => `${t.symbol}@$${t.priceUsd?.toPrecision(3)}`).join(",") || "NONE"}`
        );
      } catch (err) {
        console.warn(`[trading] off-screener pricing failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Refresh trailing high-water marks before deciding.
  for (const pos of positions) {
    const px = priceOf.get(pos.token);
    if (px) updateHighWater(agent.id, pos.token, px);
  }

  let cashUsd: number;
  if (agent.mode === "paper") {
    cashUsd = cashFor(agent.id);
  } else if (agent.config.venue === "fomo") {
    const w = fomoWalletFor(agent);
    if (!w) {
      noteTick(agent.id, "no Solana wallet — fomo trading disabled");
      return;
    }
    cashUsd = await splBalance(w.address, USDC_MINT);
    if (cashUsd < 5 && positions.length === 0) {
      noteTick(agent.id, "fund the fomo wallet: deposit USDC to the account, then the bot trades gaslessly");
      return;
    }
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
  // The daily cap limits risk-TAKING, not risk-REDUCTION: a stop-loss that
  // arrives after the cap is spent must still fire, or a capped-out agent
  // rides losers to zero. Sells always pass; only buys consume the budget.
  const proposed = await STRATEGIES[agent.strategy](input);
  const orders = [
    ...proposed.filter((o) => o.side === "sell"),
    ...proposed.filter((o) => o.side === "buy").slice(0, Math.max(0, remaining)),
  ];

  // Per-trade theses written by the analyst this tick, keyed by token so they
  // can ride along with the fill alert and be queued for the fomo feed.
  const thesisByToken = new Map<string, string>();
  for (const o of orders) if (o.thesis) thesisByToken.set(o.token, o.thesis);

  let executed = 0;
  let lastError: string | null = null;
  for (const order of orders) {
    try {
      if (agent.mode === "paper") {
        await executePaper(agent, order, tokens.find((t) => addrKey(t.address) === order.token));
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
      const { STRATEGY_META, recordThesis } = await import("@/lib/trading/store");
      const venue = agent.config.venue ?? "rhc";
      for (const fill of fillsFor(agent.id, executed)) {
        let thesis = thesisByToken.get(fill.token);
        // fomo fills MUST carry a thesis (that's the whole point of the feed).
        // The analyst's inline thesis is best-effort, so guarantee one here.
        if (!thesis && venue === "fomo") {
          try {
            const { writeThesis } = await import("@/lib/trading/analyst");
            thesis = await writeThesis({
              side: fill.side,
              symbol: fill.symbol,
              reason: fill.reason,
              token: tokens.find((t) => addrKey(t.address) === fill.token),
            });
          } catch {
            /* writeThesis has its own fallback; ignore hard failures */
          }
        }
        // Persist the thesis (public trail + fomo posting queue) once per fill.
        if (thesis) {
          try {
            recordThesis({
              agentId: agent.id,
              token: fill.token,
              symbol: fill.symbol,
              side: fill.side,
              venue,
              thesis,
              txHash: fill.txHash,
              valueUsd: fill.valueUsd,
              priceUsd: fill.priceUsd,
            });
          } catch {
            /* thesis storage is best-effort */
          }
        }
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
          thesis,
          venue,
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
      : agent.config.venue === "fomo"
        ? await fomoEquityUsd(agent.id, tokens)
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

    // One shared Solana snapshot per tick, only when a fomo agent is active.
    let solTokens: ScreenerToken[] | null = null;
    if (agents.some((a) => a.config.venue === "fomo")) {
      try {
        solTokens = await solScreener();
      } catch (err) {
        console.error("[trading] solana screener failed:", (err as Error).message);
      }
    }

    let errors = 0;
    for (const agent of agents) {
      const onHl = agent.config.venue === "hyperliquid";
      const onFomo = agent.config.venue === "fomo";
      // fomo agents trade either their own encrypted wallet (needs
      // TRADING_WALLET_SECRET) or the shared env key; either unlocks live mode.
      if (agent.mode === "live" && onFomo && !fomoSolanaEnabled() && !liveTradingEnabled()) {
        noteTick(agent.id, "no Solana wallet key configured — fomo trading disabled");
        continue;
      }
      if (agent.mode === "live" && !onFomo && !liveTradingEnabled()) {
        noteTick(agent.id, "live trading disabled on this server");
        continue;
      }
      if (agent.mode === "live" && !onHl && !onFomo && ACTIVE_CHAIN.chainIdDecimal !== 4663) {
        noteTick(agent.id, "live trading disabled on this server");
        continue;
      }
      if (onHl && !hlTokens) {
        noteTick(agent.id, "hyperliquid data unavailable this tick");
        continue;
      }
      if (onFomo && !solTokens) {
        noteTick(agent.id, "solana data unavailable this tick");
        continue;
      }
      try {
        await tickAgent(agent, onHl ? hlTokens! : onFomo ? solTokens! : tokens);
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

/**
 * Drain the fomo thesis queue from the engine tick. The publish cron only runs
 * every 15 minutes, which left freshly-executed trades sitting silent on the
 * feed; a 60-90s cadence also matches fomo's 1-min-per-trade comment limit so
 * rate-limited rows retry naturally on the next pass.
 */
let flushingTheses = false;
async function flushThesesQuietly(): Promise<void> {
  if (flushingTheses) return;
  flushingTheses = true;
  try {
    const { pendingFomoTheses } = await import("@/lib/trading/store");
    if (pendingFomoTheses(1).length === 0) return;
    const { flushFomoTheses } = await import("@/lib/trading/fomo-thesis");
    const r = await flushFomoTheses();
    if (r.posted > 0) console.log(`[fomo] posted ${r.posted} thesis(es), ${r.pending} pending`);
  } catch (err) {
    console.warn("[fomo] thesis flush failed:", err instanceof Error ? err.message : err);
  } finally {
    flushingTheses = false;
  }
}

export function startTradingEngine(): void {
  if (engineHandle || process.env.TRADING_DISABLED === "1") return;
  engineHandle = setInterval(() => {
    tradingTick().catch((err) => console.error("[trading] tick crashed:", err));
    void flushThesesQuietly();
  }, 60_000);
  setTimeout(() => {
    tradingTick().catch((err) => console.error("[trading] first tick crashed:", err));
  }, 20_000);
  console.log("[trading] engine started (60s tick)");
}
