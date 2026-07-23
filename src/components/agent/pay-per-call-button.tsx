"use client";

import { useState } from "react";
import { Check, Zap } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

type Phase = "idle" | "quoting" | "connecting" | "paying" | "confirming" | "done" | "error";

interface PayPerCallButtonProps {
  slug: string;
  /** Tool to purchase one call for. Defaults to "ask". */
  tool?: string;
  className?: string;
}

/**
 * x402 pay-per-call: quote → USDG transfer to the creator → confirm tx →
 * one tool credit. Alternative to a monthly subscription for one-off use
 * and agent-to-agent callers.
 */
export function PayPerCallButton({ slug, tool = "ask", className }: PayPerCallButtonProps) {
  const { address, connect, authenticate, sendUsdg } = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    try {
      setPhase("quoting");
      const quoteRes = await fetch(`/api/x402?slug=${encodeURIComponent(slug)}&tool=${encodeURIComponent(tool)}`);
      const quote = await quoteRes.json();
      if (!quote.ok || !quote.requirement) {
        throw new Error(quote.error ?? "Pay-per-call unavailable for this business");
      }
      const { payTo, amountUsdg } = quote.requirement as { payTo: string; amountUsdg: number };
      setAmount(amountUsdg);

      let account = address;
      if (!account) {
        setPhase("connecting");
        account = await connect();
        if (!account) {
          setPhase("idle");
          return;
        }
      }
      setPhase("connecting");
      const authed = await authenticate();
      if (!authed) throw new Error("Wallet signature required");

      setPhase("paying");
      const txHash = await sendUsdg(payTo, amountUsdg);

      setPhase("confirming");
      const confirm = await fetch("/api/x402", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, tool, txHash }),
      }).then((r) => r.json());
      if (!confirm.ok) throw new Error(confirm.error ?? "Payment confirmation failed");

      setPhase("done");
    } catch (e) {
      setPhase("error");
      const message = e instanceof Error ? e.message : "Something went wrong";
      setError(/rejected|denied/i.test(message) ? "Transaction cancelled" : message);
    }
  }

  const label =
    phase === "quoting"
      ? "Fetching quote…"
      : phase === "connecting"
        ? "Connecting wallet…"
        : phase === "paying"
          ? `Confirm in wallet · ${amount != null ? `${amount} USDG` : "USDG"}`
          : phase === "confirming"
            ? "Verifying on chain…"
            : phase === "done"
              ? "Credit granted"
              : "Pay per call · USDG";

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={phase !== "idle" && phase !== "error"}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-accent/40 px-6 text-[14px] font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-70"
      >
        {phase === "done" ? (
          <Check className="size-4" strokeWidth={2.5} />
        ) : (
          <Zap className="size-4" strokeWidth={2} />
        )}
        {label}
      </button>
      {error && <p className="mt-2 text-[12px] text-negative">{error}</p>}
      {phase === "done" && (
        <p className="mt-2 text-[12px] text-muted">
          One <span className="text-foreground">{tool}</span> credit unlocked — call the MCP
          endpoint with your wallet, no subscription needed.
        </p>
      )}
    </div>
  );
}
