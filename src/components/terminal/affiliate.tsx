"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Crown, Gift, Users } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { timeAgo } from "@/components/terminal/widgets";

interface Tier {
  id: string;
  name: string;
  minActive: number;
  sharePct: number;
}

interface AffiliateData {
  code: string;
  link: string;
  total: number;
  active: number;
  tier: Tier;
  nextTier: Tier | null;
  referrals: { wallet: string; at: string; active: boolean }[];
  tiers: Tier[];
}

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

export function AffiliateView() {
  const { address, connect, authenticate } = useWallet();
  const [data, setData] = useState<AffiliateData | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setState("loading");
    if (!(await authenticate())) {
      setState("error");
      return;
    }
    try {
      const res = await fetch("/api/affiliate");
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setState("ready");
    } catch {
      setState("error");
    }
  }, [address, authenticate]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight text-foreground">Affiliate</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Share your link, earn a cut of every trade your referrals make — forever.
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-1.5 rounded-md border border-[#e8b04b]/40 bg-[#e8b04b]/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-gold">
            <Crown size={12} /> Tier: {data.tier.name} · {data.tier.sharePct}% rev share
          </div>
        )}
      </div>

      {!address ? (
        <div className="card-frame mt-6 flex flex-col items-center gap-3 rounded-lg p-10 text-center">
          <Gift size={22} className="text-subtle" />
          <p className="text-[13px] text-muted">Connect your wallet to get your referral link.</p>
          <button
            type="button"
            onClick={() => connect()}
            className="mt-1 rounded-md bg-accent px-4 py-2 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Connect Wallet
          </button>
        </div>
      ) : state !== "ready" || !data ? (
        <div className="card-frame mt-6 rounded-lg p-10 text-center text-[12.5px] text-muted">
          {state === "error" ? (
            <>
              Sign the session request to load your affiliate stats.{" "}
              <button type="button" onClick={load} className="text-accent underline-offset-2 hover:underline">
                Retry
              </button>
            </>
          ) : (
            "Loading your referral program…"
          )}
        </div>
      ) : (
        <>
          {/* Referral link */}
          <div className="card-frame mt-6 flex flex-col gap-3 rounded-lg p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-raised text-accent">
                <Gift size={16} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
                  Your referral link
                </p>
                <p className="mt-0.5 break-all font-mono-num text-[13px] text-foreground">
                  {data.link.replace(/^https?:\/\//, "")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={copy}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          {/* Stats */}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="card-frame rounded-lg p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
                Referrals
              </p>
              <p className="mt-1.5 font-mono-num text-[22px] font-bold text-foreground">
                {data.total}
              </p>
              <p className="text-[11px] text-subtle">wallets signed in with your link</p>
            </div>
            <div className="card-frame rounded-lg p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
                Active referrals
              </p>
              <p className="mt-1.5 font-mono-num text-[22px] font-bold text-up">{data.active}</p>
              <p className="text-[11px] text-subtle">running at least one agent</p>
            </div>
            <div className="card-frame rounded-lg p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
                Your share
              </p>
              <p className="mt-1.5 font-mono-num text-[22px] font-bold text-gold">
                {data.tier.sharePct}%
              </p>
              <p className="text-[11px] text-subtle">
                {data.nextTier
                  ? `${data.nextTier.minActive - data.active} more active for ${data.nextTier.name}`
                  : "max tier reached"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_320px]">
            {/* Referral list */}
            <div className="card-frame rounded-lg">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
                  <Users size={12} /> Your referrals
                </p>
                <span className="font-mono-num text-[11px] text-subtle">{data.total} wallets</span>
              </div>
              {data.referrals.length === 0 ? (
                <div className="p-8 text-center text-[12.5px] text-muted">
                  No referrals yet. Share your link — every wallet that signs in through it is
                  yours, forever.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data.referrals.map((r) => (
                    <div key={r.wallet} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.active ? "bg-[#2dd4a7]" : "bg-white/20"}`}
                      />
                      <span className="font-mono-num text-[12px] text-foreground">
                        {short(r.wallet)}
                      </span>
                      <span className="text-[11px] text-subtle">joined {timeAgo(r.at)} ago</span>
                      <span className="ml-auto text-[11px] text-muted">
                        {r.active ? "running agents" : "signed up"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tiers */}
            <div className="card-frame h-fit rounded-lg">
              <div className="border-b border-border px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
                  Rev-share tiers
                </p>
              </div>
              <div className="divide-y divide-border">
                {data.tiers.map((t) => {
                  const current = t.id === data.tier.id;
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center gap-3 px-4 py-3 ${current ? "bg-raised/60" : ""}`}
                    >
                      <span className="flex size-6 items-center justify-center rounded border border-border font-mono-num text-[10px] text-subtle">
                        {t.id}
                      </span>
                      <div>
                        <p className={`text-[12.5px] font-medium ${current ? "text-gold" : "text-foreground"}`}>
                          {t.name} {current && <Crown size={11} className="mb-0.5 inline" />}
                        </p>
                        <p className="text-[10.5px] text-subtle">
                          {t.minActive === 0 ? "0+ referrals" : `${t.minActive}+ active traders`}
                        </p>
                      </div>
                      <span
                        className={`ml-auto font-mono-num text-[13px] font-bold ${current ? "text-gold" : "text-muted"}`}
                      >
                        {t.sharePct}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="border-t border-border px-4 py-3 text-[10.5px] leading-relaxed text-subtle">
                Tracking is live now. Rewards accrue in ETH per epoch and unlock with the V2 fee
                switch — your referrals pay nothing extra.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
