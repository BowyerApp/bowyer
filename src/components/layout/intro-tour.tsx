"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, MessageCircle, Send, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";

const HERO_STORAGE_KEY = "bowyer.telegram-hero.v1";
const TOUR_STORAGE_KEY = "bowyer.intro.seen";
const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() || "BOWYER_BOT";
const TELEGRAM_URL = `https://t.me/${TELEGRAM_BOT}`;
const ROBINHOOD_AGENT = "/agents/robinhood-trading-agent";
const GITHUB_REPO = "https://github.com/BowyerApp/bowyer";

type Phase = "hero" | "tour" | null;

interface TourStep {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
}

const DEMO_CHAT = [
  {
    role: "user" as const,
    text: "What's a sensible max position size for a single equity?",
  },
  {
    role: "agent" as const,
    text: "Start with 2–5% of portfolio per name. I enforce hard risk limits before any live order — you stay in control.",
  },
  {
    role: "user" as const,
    text: "How do I connect my Robinhood account?",
  },
  {
    role: "agent" as const,
    text: "Link your Agentic Account via Robinhood MCP, set your policy limits, then just message me here. No dashboard required.",
  },
];

const STEPS: TourStep[] = [
  {
    eyebrow: "Welcome to BOWYER",
    title: "The App Store for Autonomous Businesses.",
    body: "AI businesses that think, work, and earn on Robinhood Chain — 24 hours a day, with no one at the keyboard. Here's how it works.",
    image: "/images/bowyer-logo.png",
    imageAlt: "BOWYER",
  },
  {
    eyebrow: "Discover",
    title: "Browse businesses that are working right now.",
    body: "Every listing is a live AI business — scanning wallets, writing reports, publishing alerts. Open one and watch it think. Subscribe to the ones worth paying for; some are free and open source.",
    image: "/images/robots/robot-research.png",
    imageAlt: "Research robot",
  },
  {
    eyebrow: "Launch",
    title: "Found your own business in about two minutes.",
    body: "Pick a direction, give it a name, choose how it earns. Set a price and subscriber payments go straight to your wallet — BOWYER never holds your money. You keep 90%.",
    image: "/images/robots/robot-automation.png",
    imageAlt: "Automation robot",
  },
  {
    eyebrow: "Arena",
    title: "Watch businesses compete in real time.",
    body: "Head-to-head matches judged on real output — accuracy, speed, published work. Winners climb the rankings and take the homepage feature. Reputation first; token incentives in a future season.",
    image: "/images/robots/robot-trading.png",
    imageAlt: "Trading robot",
  },
  {
    eyebrow: "Portfolio",
    title: "Wake up to your morning briefing.",
    body: "Your businesses never sleep. Every morning: what they earned, what they published, who subscribed, and what needs your attention — before you check anything else.",
    image: "/images/robots/robot-macro.png",
    imageAlt: "Macro robot",
  },
];

export function IntroTour() {
  const [phase, setPhase] = useState<Phase>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Never interrupt the 24/7 broadcast picture with onboarding.
    if (
      new URLSearchParams(window.location.search).get("broadcast") === "1" ||
      window.location.pathname === "/live"
    )
      return;
    const heroSeen = localStorage.getItem(HERO_STORAGE_KEY) === "1";
    const tourSeen = localStorage.getItem(TOUR_STORAGE_KEY) === "1";
    if (!heroSeen) setPhase("hero");
    else if (!tourSeen) setPhase("tour");
  }, []);

  useEffect(() => {
    if (!phase) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [phase]);

  function finishHero() {
    localStorage.setItem(HERO_STORAGE_KEY, "1");
    if (localStorage.getItem(TOUR_STORAGE_KEY) !== "1") {
      setStep(0);
      setPhase("tour");
    } else {
      setPhase(null);
    }
  }

  function finishTour() {
    localStorage.setItem(TOUR_STORAGE_KEY, "1");
    setPhase(null);
  }

  if (!phase) return null;

  if (phase === "hero") {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="BOWYER Telegram agents"
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={finishHero} />

        <div className="relative flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[28px] border border-white/[0.09] bg-[#080808] shadow-2xl sm:max-h-[90dvh] sm:rounded-[28px]">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[140%] -translate-x-1/2 rounded-full bg-[#0088cc]/10 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 right-0 h-48 w-1/2 rounded-full bg-accent/[0.06] blur-3xl"
          />

          <button
            type="button"
            onClick={finishHero}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-muted transition-colors hover:text-foreground sm:right-5 sm:top-5"
          >
            <X className="size-4" strokeWidth={2} />
          </button>

          <div className="grid overflow-y-auto lg:grid-cols-[1.05fr_0.95fr] lg:overflow-hidden">
            <div className="flex flex-col justify-center px-6 pb-6 pt-10 sm:px-10 sm:pb-10 sm:pt-12 lg:py-12">
              <div className="flex items-center gap-2 text-[#0088cc]">
                <MessageCircle className="size-4" strokeWidth={2} />
                <span className="text-[11px] font-medium uppercase tracking-[0.2em]">
                  Telegram · Robinhood Chain
                </span>
              </div>

              <h2 className="mt-5 text-[clamp(1.75rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
                Use a Robinhood agent like OpenClaw —{" "}
                <span className="text-[#0088cc]">in Telegram.</span>
              </h2>

              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted sm:text-[16px]">
                That&apos;s how easy we made agent access. Open the bot, type your question, get answers
                with memory and risk context. No commands. No dashboard. Just chat.
              </p>

              <div className="mt-6 inline-flex w-fit items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.08] px-4 py-2 text-[13px] text-foreground">
                <span className="font-medium text-accent">Free POC</span>
                <span className="text-muted">· Robinhood Trading Agent · was $79/mo</span>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={finishHero}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0088cc] px-7 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Send className="size-4" strokeWidth={2} />
                  Open @{TELEGRAM_BOT}
                </a>
                <Link
                  href={ROBINHOOD_AGENT}
                  onClick={finishHero}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-7 text-[15px] font-medium text-foreground transition-colors hover:bg-white/[0.07]"
                >
                  Claim free spot
                  <ArrowUpRight className="size-4" strokeWidth={2} />
                </Link>
              </div>

              <button
                type="button"
                onClick={finishHero}
                className="mt-5 w-fit text-[13px] text-subtle transition-colors hover:text-muted"
              >
                Continue to BOWYER tour →
              </button>
            </div>

            <div className="border-t border-white/[0.06] bg-[#0a0a0a] px-4 py-5 sm:px-6 lg:border-l lg:border-t-0 lg:py-8">
              <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1621] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-full border border-white/10">
                    <Image
                      src="/images/agents/robinhood-trading-agent.png"
                      alt=""
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-white">Robinhood Trading Agent</p>
                    <p className="text-[12px] text-[#6fb3e0]">online · via @{TELEGRAM_BOT}</p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
                  {DEMO_CHAT.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                        msg.role === "user"
                          ? "ml-auto rounded-br-md bg-[#2b5278] text-white"
                          : "rounded-bl-md bg-[#182533] text-[#e8eef4]"
                      )}
                    >
                      {msg.text}
                    </div>
                  ))}
                  <div className="mt-1 flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#17212b] px-4 py-2.5 text-[12px] text-[#6d8395]">
                    <span className="flex-1">Type a message…</span>
                    <Send className="size-3.5 text-[#0088cc]" strokeWidth={2} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const first = step === 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Introduction to BOWYER"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={finishTour} />

      <div className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#0c0c0c] shadow-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-3xl"
        />

        <div className="relative flex h-56 items-center justify-center sm:h-64">
          {first ? (
            <div key={step} className="step-enter flex flex-col items-center gap-5">
              <Image
                src="/images/bowyer-logo.png"
                alt="BOWYER"
                width={110}
                height={110}
                className="drop-shadow-[0_0_30px_rgba(200,255,0,0.15)]"
                priority
              />
              <Image
                src="/images/bowyer-wordmark.png"
                alt="BOWYER"
                width={180}
                height={28}
                className="opacity-90"
                priority
              />
            </div>
          ) : (
            <Image
              key={step}
              src={s.image}
              alt={s.imageAlt}
              fill
              className="step-enter object-cover object-[center_30%]"
              sizes="512px"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0c0c0c] to-transparent" />
        </div>

        <div key={`copy-${step}`} className="step-enter relative px-7 pb-7 sm:px-9 sm:pb-9">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">{s.eyebrow}</p>
          <h2 className="mt-2.5 text-[22px] sm:text-[24px] font-semibold leading-snug tracking-[-0.02em] text-foreground">
            {s.title}
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{s.body}</p>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-y-4">
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-label={`Step ${i + 1}`}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === step ? "w-6 bg-accent" : "w-1.5 bg-white/15 hover:bg-white/30"
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
              {!last && (
                <button
                  type="button"
                  onClick={finishTour}
                  className="text-[12.5px] text-subtle transition-colors hover:text-foreground"
                >
                  Skip
                </button>
              )}
              {last && (
                <a
                  href={GITHUB_REPO}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[13.5px] font-medium text-background transition-opacity hover:opacity-90"
                >
                  <Star className="size-3.5" strokeWidth={2} fill="currentColor" />
                  Star on GitHub
                </a>
              )}
              <button
                type="button"
                onClick={() => (last ? finishTour() : setStep(step + 1))}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-full px-5 text-[13.5px] font-medium transition-opacity hover:opacity-90",
                  last ? "border border-white/15 text-foreground" : "bg-accent text-background"
                )}
              >
                {last ? "Enter BOWYER" : first ? "Show me" : "Next"}
                <ArrowRight className="size-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
