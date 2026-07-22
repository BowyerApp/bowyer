import { NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/wallet-auth";
import {
  bowyerTokenAddress,
  fetchTokenBalanceWei,
  hasPremiumAccess,
  minTokenBalanceLabel,
  minTokenBalanceWei,
  premiumBusinessLimitForTier,
  premiumPlatformModelIds,
  tierForBalance,
  tierThresholdsWei,
  tokenGateConfigured,
} from "@/lib/token-gate";

function formatTokens(wei: bigint): string {
  const whole = wei / BigInt(1_000_000_000_000_000_000);
  return whole.toLocaleString("en-US");
}

function tierTable() {
  const t = tierThresholdsWei();
  return [
    { tier: "holder", minTokens: formatTokens(t.holder), premiumBusinessLimit: 1 },
    { tier: "founder", minTokens: formatTokens(t.founder), premiumBusinessLimit: 5 },
    { tier: "partner", minTokens: formatTokens(t.partner), premiumBusinessLimit: null },
  ];
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Check whether the signed-in wallet holds enough $BOWYER for premium models. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const queryWallet = searchParams.get("wallet")?.trim();
  const sessionWallet = getSessionWallet(req);
  const wallet = queryWallet || sessionWallet;

  if (!tokenGateConfigured()) {
    return NextResponse.json({
      ok: true,
      configured: false,
      unlocked: false,
      message: "Token gating is not configured on this deployment.",
      premiumModels: premiumPlatformModelIds(),
    });
  }

  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({
      ok: true,
      configured: true,
      unlocked: false,
      wallet: null,
      tokenAddress: bowyerTokenAddress(),
      minBalance: minTokenBalanceLabel(),
      premiumModels: premiumPlatformModelIds(),
      tiers: tierTable(),
    });
  }

  const balanceWei = await fetchTokenBalanceWei(wallet);
  const unlocked = await hasPremiumAccess(wallet);
  const tier = balanceWei !== null ? tierForBalance(balanceWei) : "none";

  return NextResponse.json({
    ok: true,
    configured: true,
    unlocked,
    tier,
    premiumBusinessLimit: premiumBusinessLimitForTier(tier),
    wallet: wallet.toLowerCase(),
    tokenAddress: bowyerTokenAddress(),
    balanceWei: balanceWei?.toString() ?? null,
    minBalanceWei: minTokenBalanceWei().toString(),
    minBalance: minTokenBalanceLabel(),
    premiumModels: premiumPlatformModelIds(),
    tiers: tierTable(),
  });
}
