import { rpcUrl } from "@/lib/chain";
import {
  isPremiumPlatformModelId,
  PLATFORM_MODELS,
} from "@/lib/llm-config";

const BALANCE_OF_SELECTOR = "0x70a08231";
const RPC_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 bowyer-runtime",
};

/** ERC-20 `balanceOf(address)` via eth_call. */
export function tokenGateConfigured(): boolean {
  return Boolean(process.env.BOWYER_TOKEN_ADDRESS?.trim());
}

export function bowyerTokenAddress(): string | null {
  const addr = process.env.BOWYER_TOKEN_ADDRESS?.trim();
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr : null;
}

export function bowyerTokenRpc(): string {
  return process.env.BOWYER_TOKEN_RPC?.trim() || rpcUrl();
}

/** Minimum raw token balance (wei) required to unlock premium models. Default: 1 token @ 18 decimals. */
export function minTokenBalanceWei(): bigint {
  const raw = process.env.BOWYER_TOKEN_MIN_BALANCE?.trim();
  if (raw) {
    try {
      return BigInt(raw);
    } catch {
      /* fall through */
    }
  }
  return BigInt(1_000_000_000_000_000_000);
}

export function minTokenBalanceLabel(): string {
  const wei = minTokenBalanceWei();
  const whole = wei / BigInt(1_000_000_000_000_000_000);
  const frac = wei % BigInt(1_000_000_000_000_000_000);
  if (frac === BigInt(0)) return whole.toString();
  return `${whole}.${frac.toString().padStart(18, "0").replace(/0+$/, "")}`;
}

function padAddress(address: string): string {
  return address.toLowerCase().replace("0x", "").padStart(64, "0");
}

export async function fetchTokenBalanceWei(wallet: string): Promise<bigint | null> {
  const token = bowyerTokenAddress();
  if (!token || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return null;

  const data = `${BALANCE_OF_SELECTOR}${padAddress(wallet)}`;
  try {
    const res = await fetch(bowyerTokenRpc(), {
      method: "POST",
      headers: RPC_HEADERS,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: token, data }, "latest"],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string; error?: { message: string } };
    if (json.error || !json.result || json.result === "0x") return BigInt(0);
    return BigInt(json.result);
  } catch {
    return null;
  }
}

export async function hasPremiumAccess(wallet: string | null | undefined): Promise<boolean> {
  if (!wallet || !tokenGateConfigured()) return false;
  const balance = await fetchTokenBalanceWei(wallet);
  if (balance === null) return false;
  return balance >= minTokenBalanceWei();
}

/* ---------------- holder tiers ---------------- */

export type HolderTier = "none" | "holder" | "founder" | "partner";

/** Multiples of the base gate: Holder 1× (1 business), Founder 5× (5), Partner 10× (unlimited). */
const FOUNDER_MULTIPLE = BigInt(5);
const PARTNER_MULTIPLE = BigInt(10);

export interface HolderTierStatus {
  tier: HolderTier;
  /** Max businesses that may run premium models. null = unlimited. */
  premiumBusinessLimit: number | null;
  balanceWei: bigint | null;
}

export function tierThresholdsWei(): { holder: bigint; founder: bigint; partner: bigint } {
  const base = minTokenBalanceWei();
  return { holder: base, founder: base * FOUNDER_MULTIPLE, partner: base * PARTNER_MULTIPLE };
}

export function tierForBalance(balance: bigint): HolderTier {
  const t = tierThresholdsWei();
  if (balance >= t.partner) return "partner";
  if (balance >= t.founder) return "founder";
  if (balance >= t.holder) return "holder";
  return "none";
}

export function premiumBusinessLimitForTier(tier: HolderTier): number | null {
  if (tier === "partner") return null;
  if (tier === "founder") return 5;
  if (tier === "holder") return 1;
  return 0;
}

export async function getHolderTierStatus(
  wallet: string | null | undefined
): Promise<HolderTierStatus> {
  if (!wallet || !tokenGateConfigured()) {
    return { tier: "none", premiumBusinessLimit: 0, balanceWei: null };
  }
  const balance = await fetchTokenBalanceWei(wallet);
  if (balance === null) return { tier: "none", premiumBusinessLimit: 0, balanceWei: null };
  const tier = tierForBalance(balance);
  return { tier, premiumBusinessLimit: premiumBusinessLimitForTier(tier), balanceWei: balance };
}

export function premiumPlatformModelIds(): string[] {
  return PLATFORM_MODELS.filter((m) => m.premium).map((m) => m.id);
}

export function assertPremiumModelAllowed(modelId: string, wallet: string | null): string | null {
  if (!isPremiumPlatformModelId(modelId)) return null;
  return `Premium model "${modelId}" requires holding $BOWYER (min ${minTokenBalanceLabel()} tokens).`;
}
