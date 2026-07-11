"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "bowyer.intro.seen";

interface TourStep {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
}

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
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "1") setOpen(true);
  }, []);

  // Lock page scroll while the tour is open.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

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
      {/* blurred backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={dismiss} />

      {/* card */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#0c0c0c] shadow-2xl">
        {/* accent glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-3xl"
        />

        {/* visual */}
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

        {/* copy */}
        <div key={`copy-${step}`} className="step-enter relative px-7 pb-7 sm:px-9 sm:pb-9">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
            {s.eyebrow}
          </p>
          <h2 className="mt-2.5 text-[22px] sm:text-[24px] font-semibold leading-snug tracking-[-0.02em] text-foreground">
            {s.title}
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{s.body}</p>

          {/* controls */}
          <div className="mt-8 flex items-center justify-between">
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

            <div className="flex items-center gap-4">
              {!last && (
                <button
                  type="button"
                  onClick={dismiss}
                  className="text-[12.5px] text-subtle transition-colors hover:text-foreground"
                >
                  Skip
                </button>
              )}
              <button
                type="button"
                onClick={() => (last ? dismiss() : setStep(step + 1))}
                className="flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[13.5px] font-medium text-background transition-opacity hover:opacity-90"
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
