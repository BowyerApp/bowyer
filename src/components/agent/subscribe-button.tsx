"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useWallet, usdToEthLabel } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";
import type { AgentPricing } from "@/lib/types";

type Phase = "idle" | "connecting" | "paying" | "recording" | "done" | "error";

interface SubscribeButtonProps {
  slug: string;
  pricing: AgentPricing;
  size?: "md" | "lg";
  className?: string;
}

export function SubscribeButton({ slug, pricing, size = "md", className }: SubscribeButtonProps) {
  const { address, connect, sendPayment } = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const isFree = pricing.model === "free" || pricing.amount <= 0;
  const priceLabel = isFree
    ? "Use for free"
    : `Subscribe · $${pricing.amount}${pricing.model === "subscription" ? "/month" : ""}`;

  async function recordSubscription(subscriber: string, txHash?: string) {
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, subscriber, txHash }),
    });
    return { status: res.status, data: await res.json() };
  }

  async function handleClick() {
    setError(null);
    try {
      let account = address;
      if (!account) {
        setPhase("connecting");
        account = await connect();
        if (!account) {
          setPhase("idle");
          return;
        }
      }

      setPhase("recording");
      let result = await recordSubscription(account);

      // 402 means payment required — pay the creator, then record with the tx hash.
      if (result.status === 402) {
        const payout = result.data.payoutAddress as string | null;
        const amountUsd = Number(result.data.amountUsd ?? pricing.amount);
        if (!payout) throw new Error("This business has no payout address configured");
        setPhase("paying");
        const txHash = await sendPayment(payout, amountUsd);
        setPhase("recording");
        result = await recordSubscription(account, txHash);
      }

      if (!result.data.ok) throw new Error(result.data.error ?? "Subscription failed");
      setPhase("done");
    } catch (e) {
      setPhase("error");
      const message = e instanceof Error ? e.message : "Something went wrong";
      setError(/rejected|denied/i.test(message) ? "Transaction cancelled" : message);
    }
  }

  const label =
    phase === "connecting"
      ? "Connecting wallet…"
      : phase === "paying"
        ? `Confirm in wallet · ${usdToEthLabel(pricing.amount)}`
        : phase === "recording"
          ? "Finalizing…"
          : phase === "done"
            ? "Subscribed"
            : priceLabel;

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={phase === "done" || phase === "connecting" || phase === "paying" || phase === "recording"}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-sm bg-accent font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-70",
          size === "lg" ? "h-12 px-10 text-[15px]" : "h-11 px-6 text-[14px]"
        )}
      >
        {phase === "done" && <Check className="size-4" strokeWidth={2.5} />}
        {label}
      </button>
      {error && <p className="mt-2 text-[12px] text-negative">{error}</p>}
        {phase === "done" && (
        <p className="mt-2 text-[12px] text-muted">
          {isFree ? "You now have access to this business. " : "Payment verified on chain — you're in. "}
          <a href="#setup" className="text-accent underline underline-offset-2">
            Set up access ↓
          </a>
        </p>
      )}
    </div>
  );
}
