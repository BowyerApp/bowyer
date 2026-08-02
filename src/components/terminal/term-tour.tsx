"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";

const STORAGE_KEY = "bowyer.v2.tour.v1";
const OPEN_EVENT = "bowyer:v2tour";

interface TourStep {
  /** data-tour attribute of the element to spotlight; omit for a centered card. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to BOWYER V2",
    body: "A live trading terminal for Robinhood Chain. Everything on screen is real — prices, launches, liquidity and agent audits, refreshed as the chain moves. Here's the 60-second lay of the land.",
  },
  {
    target: "discover",
    title: "Discover",
    body: "The full screener. Every token trading on Robinhood Chain with price, volume, liquidity, holders and an automated agent verdict on each one. Sort, filter, and click any row for the deep dive.",
  },
  {
    target: "pulse",
    title: "The Hood",
    body: "The launch feed. Brand-new pools the moment they're created, tokens heating up, and the current chain leaders — straight from our radar scanning Uniswap v2/v3 pool events.",
  },
  {
    target: "equities",
    title: "Equities",
    body: "Tokenized stocks on Robinhood Chain — AAPL, NVDA, TSLA and the rest — with live onchain prices next to their real-market quotes.",
  },
  {
    target: "trading",
    title: "Trading agents",
    body: "Deploy an autonomous strategy — Momentum Sniper, Wave Rider, Grid Maker or Dip Hunter. Start in paper mode with a virtual bankroll, or go live: each agent gets its own wallet, trades real USDG onchain, and you can withdraw everything at any time.",
  },
  {
    target: "tracker",
    title: "Tracker",
    body: "Watch any wallet on the chain. Balances, token holdings and recent activity — add addresses to your watchlist and they persist between visits.",
  },
  {
    target: "search",
    title: "Look up any token",
    body: "Paste a token address here to pull its full breakdown: chart, pools, live trades, top holders and the agent's risk audit.",
  },
  {
    target: "account",
    title: "Your account",
    body: "My agents shows what you're subscribed to. Connections links your wallet, Telegram and socials. Affiliate gives you a permanent referral link — invite traders, earn a rev share.",
  },
  {
    target: "wallet",
    title: "Connect your wallet",
    body: "One click to connect. That unlocks trading agents, subscriptions and your affiliate dashboard. We never take custody of your main wallet — agents run on their own dedicated ones.",
  },
  {
    title: "You're set",
    body: "The tape is live and the agents are on the clock. You can replay this tour anytime with the Tutorial button at the bottom of the sidebar.",
  },
];

const CARD_W = 330;

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Private mode — the tour will simply offer itself again next visit.
  }
}

/** Sidebar button that replays the tour. */
export function TermTourButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-muted transition-colors hover:bg-raised/60 hover:text-foreground"
    >
      <CircleHelp size={15} strokeWidth={1.8} />
      Tutorial
    </button>
  );
}

export function TermTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      seen = true;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!seen) {
      timer = setTimeout(() => {
        setStep(0);
        setOpen(true);
      }, 900);
    }
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(OPEN_EVENT, reopen);
    };
  }, []);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
  }, []);

  const next = useCallback(() => {
    if (stepRef.current >= STEPS.length - 1) {
      markSeen();
      setOpen(false);
    } else {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }, []);

  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  // Track the spotlighted element's position; fall back to a centered card
  // when the target is missing or hidden (e.g. sidebar on mobile).
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const target = STEPS[stepRef.current]?.target;
      if (!target) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (!el || el.offsetParent === null) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect(r.width > 0 && r.height > 0 ? r : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, next, back]);

  if (!open) return null;

  const pad = 6;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const narrow = vw < 720;

  // Card placement: centered when there's no target, below top-bar targets,
  // beside sidebar targets.
  let cardStyle: React.CSSProperties;
  if (!rect || narrow) {
    cardStyle = {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: Math.min(CARD_W, vw - 32),
    };
  } else if (rect.top < 64) {
    cardStyle = {
      left: Math.max(16, Math.min(rect.left + rect.width / 2 - CARD_W / 2, vw - CARD_W - 16)),
      top: rect.bottom + 16,
      width: CARD_W,
    };
  } else {
    cardStyle = {
      left: Math.min(rect.right + 16, vw - CARD_W - 16),
      top: Math.max(16, Math.min(rect.top - 12, vh - 260)),
      width: CARD_W,
    };
  }

  return (
    <div className="fixed inset-0 z-[70]">
      {/* click-blocker; clicking anywhere advances */}
      <div className="absolute inset-0" onClick={next} />

      {/* spotlight hole or full dim */}
      {rect && !narrow ? (
        <div
          className="pointer-events-none absolute rounded-lg border border-accent/50"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 200vmax rgba(3, 6, 5, 0.82), 0 0 24px rgba(190, 242, 100, 0.12)",
            transition: "all 200ms ease",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[#030605]/85" />
      )}

      {/* card */}
      <div
        className="absolute rounded-lg border border-border bg-ink p-4 shadow-2xl"
        style={{ ...cardStyle, transition: "left 200ms ease, top 200ms ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono-num text-[10px] uppercase tracking-[0.18em] text-accent">
            {step === 0 ? "Tutorial" : last ? "Done" : `Step ${step} / ${STEPS.length - 2}`}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close tutorial"
            className="text-subtle transition-colors hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
        <h3 className="mt-2 text-[15px] font-bold tracking-tight text-foreground">
          {current.title}
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{current.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1 w-3 rounded-full ${i <= step ? "bg-accent" : "bg-white/15"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-muted transition-colors hover:text-foreground"
              >
                Back
              </button>
            )}
            {step === 0 && (
              <button
                type="button"
                onClick={close}
                className="rounded-md px-2.5 py-1.5 text-[11.5px] text-subtle transition-colors hover:text-foreground"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-black transition-opacity hover:opacity-90"
            >
              {step === 0 ? "Take the tour" : last ? "Start trading" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
