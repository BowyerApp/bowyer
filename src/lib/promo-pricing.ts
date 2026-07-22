import { countActiveSubscriptionsForAgent } from "@/lib/data/agent-registry";
import type { AgentPricing, AgentSummary } from "@/lib/types";

export interface PromoOffer {
  slug: string;
  listPriceUsd: number;
  limit: number;
  headline: string;
  detail: string;
}

/** Limited-time offers — first N subscribers subscribe without payment. */
export const PROMO_OFFERS: PromoOffer[] = [
  {
    slug: "robinhood-trading-agent",
    listPriceUsd: 79,
    limit: 25,
    headline: "Proof-of-concept cohort — free for the next 25 subscribers",
    detail:
      "We want real traders using the Robinhood Trading Agent and sharing positive results. " +
      "First 25 get full access free while we collect proof the product works.",
  },
  {
    slug: "atlas-macro",
    listPriceUsd: 59,
    limit: 10,
    headline: "Founding cohort — free for the first 10 subscribers",
    detail:
      "Atlas runs on a frontier reasoning model with multi-source deep research on every report. " +
      "The first 10 subscribers get full access free — we want holders talking to it and proving the coverage.",
  },
  {
    slug: "nyx-forensics",
    listPriceUsd: 49,
    limit: 10,
    headline: "Founding cohort — free for the first 10 subscribers",
    detail:
      "Nyx does evidence-anchored forensic analysis of Robinhood Chain on a frontier reasoning model. " +
      "First 10 subscribers get full access free while we build the public track record.",
  },
  {
    slug: "vega-narrative",
    listPriceUsd: 39,
    limit: 10,
    headline: "Founding cohort — free for the first 10 subscribers",
    detail:
      "Vega tracks narrative velocity on a frontier real-time model. " +
      "First 10 subscribers get full access free — early callouts are the proof.",
  },
];

export interface PromoStatus {
  active: boolean;
  listPriceUsd: number;
  spotsRemaining: number;
  spotsTotal: number;
  headline: string;
  detail: string;
}

export function getPromoStatus(slug: string): PromoStatus | null {
  const offer = PROMO_OFFERS.find((p) => p.slug === slug);
  if (!offer) return null;
  const used = countActiveSubscriptionsForAgent(slug);
  const remaining = Math.max(0, offer.limit - used);
  return {
    active: remaining > 0,
    listPriceUsd: offer.listPriceUsd,
    spotsRemaining: remaining,
    spotsTotal: offer.limit,
    headline: offer.headline,
    detail: offer.detail,
  };
}

export interface ResolvedSubscriptionPricing {
  isFree: boolean;
  chargeUsd: number;
  listPriceUsd: number | null;
  promo: PromoStatus | null;
}

export function resolveSubscriptionPricing(agent: Pick<AgentSummary, "slug" | "pricing">): ResolvedSubscriptionPricing {
  const promo = getPromoStatus(agent.slug);
  if (promo?.active) {
    return {
      isFree: true,
      chargeUsd: 0,
      listPriceUsd: promo.listPriceUsd,
      promo,
    };
  }
  const isFree = agent.pricing.model === "free" || agent.pricing.amount <= 0;
  return {
    isFree,
    chargeUsd: isFree ? 0 : agent.pricing.amount,
    listPriceUsd: null,
    promo,
  };
}

/** Pricing shape for subscribe UI (may be free during promo while list price stays on catalog). */
export function effectivePricingForSubscribe(
  agent: Pick<AgentSummary, "slug" | "pricing">
): AgentPricing & { listPriceUsd?: number } {
  const resolved = resolveSubscriptionPricing(agent);
  if (resolved.isFree && resolved.listPriceUsd) {
    return { model: "free", amount: 0, currency: "USD", listPriceUsd: resolved.listPriceUsd };
  }
  return agent.pricing;
}
