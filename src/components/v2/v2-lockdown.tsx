"use client";

import { useEffect, useState } from "react";

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function remainingUntil(target: number): Remaining {
  const diff = target - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: false,
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function V2Lockdown({ targetIso }: { targetIso: string }) {
  const [now, setNow] = useState<Remaining | null>(null);

  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const tick = () => setNow(remainingUntil(target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  const cells: Array<{ label: string; value: string }> = [
    { label: "days", value: now ? pad(now.days) : "--" },
    { label: "hours", value: now ? pad(now.hours) : "--" },
    { label: "minutes", value: now ? pad(now.minutes) : "--" },
    { label: "seconds", value: now ? pad(now.seconds) : "--" },
  ];

  return (
    <div id="v2-lockdown" className="fixed inset-0 overflow-hidden bg-black">
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/videos/desk-hero-poster.jpg"
        className="absolute inset-0 h-full w-full object-cover"
        src="/videos/desk-hero.mp4"
      />
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/90" />

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.5em] text-white/50">
          Bowyer
        </p>
        <h1 className="mt-4 text-7xl font-black leading-none tracking-tight text-white sm:text-8xl md:text-9xl">
          V<span style={{ color: "var(--accent, #c8ff00)" }}>2</span>
        </h1>
        <p className="mt-6 max-w-md text-sm text-white/70 sm:text-base">
          The floor is closed while we ship the next version of BOWYER.
        </p>

        {now?.expired ? (
          <div className="mt-12 flex flex-col items-center gap-2">
            <span
              className="animate-pulse text-3xl font-bold uppercase tracking-[0.3em] sm:text-4xl"
              style={{ color: "var(--accent, #c8ff00)" }}
            >
              Deploying
            </span>
            <span className="text-xs uppercase tracking-[0.3em] text-white/40">
              any minute now
            </span>
          </div>
        ) : (
          <div className="mt-12 flex items-start gap-3 sm:gap-6">
            {cells.map((cell, i) => (
              <div key={cell.label} className="flex items-start gap-3 sm:gap-6">
                {i > 0 && (
                  <span className="mt-1 font-mono text-4xl font-light text-white/25 sm:text-6xl">
                    :
                  </span>
                )}
                <div className="flex w-16 flex-col items-center gap-2 sm:w-24">
                  <span className="font-mono text-4xl font-semibold tabular-nums text-white sm:text-6xl">
                    {cell.value}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                    {cell.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-16 flex flex-col items-center gap-3">
          <p className="max-w-sm text-xs leading-relaxed text-white/40">
            The agents never stopped — reports, fees, and the live economy keep
            running while we build.
          </p>
          <a
            href="https://x.com/Bowyer_App"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60 transition hover:text-white"
          >
            @Bowyer_App
          </a>
        </div>
      </div>
    </div>
  );
}
