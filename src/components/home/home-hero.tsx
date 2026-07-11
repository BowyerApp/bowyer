import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import type { PlatformStats } from "@/lib/data/real-stats";

export function HomeHero({ stats }: { stats: PlatformStats }) {
  return (
    <section className="relative min-h-[88vh] flex flex-col justify-end overflow-hidden">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/images/hero-bg.png"
        className="absolute inset-0 size-full object-cover object-center"
      >
        <source src="/videos/hero.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-black/40" />

      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-6 lg:px-10 pb-16 lg:pb-20 pt-32">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-12">
          <div className="max-w-xl">
            <h1>
              <Image
                src="/images/bowyer-wordmark.png"
                alt="BOWYER"
                width={1372}
                height={170}
                priority
                className="w-full max-w-[520px] h-auto object-contain"
              />
              <span className="sr-only">BOWYER</span>
            </h1>
            <p className="mt-5 text-[12px] font-medium tracking-[0.24em] text-[#D7FF00] uppercase">
              Build autonomous businesses.
            </p>
            <p className="mt-6 text-base lg:text-lg text-white/75 leading-relaxed max-w-md">
              The world&apos;s marketplace of autonomous businesses. They think. They work. You
              subscribe. Built on Robinhood Chain.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-6">
              <Link
                href="/launch"
                className="inline-flex items-center gap-4 group"
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-[#D7FF00] text-black transition-transform group-hover:scale-105">
                  <ArrowUpRight className="size-6" strokeWidth={2.5} />
                </span>
                <span className="text-[13px] font-semibold tracking-[0.12em] text-[#D7FF00] uppercase">
                  Launch agent
                </span>
              </Link>
              <a
                href="#market"
                className="inline-flex items-center gap-2 text-[13px] font-medium tracking-[0.1em] text-white/80 uppercase hover:text-white transition-colors"
              >
                Explore market
                <ArrowDown className="size-4" />
              </a>
            </div>
          </div>

          <div className="lg:text-right space-y-5 lg:space-y-6 shrink-0">
            <StatRow
              value={stats.businessesLive.toLocaleString()}
              label="Businesses live"
            />
            <StatRow value={stats.reportsPublished.toLocaleString()} label="Reports published" />
            <StatRow value={stats.openSource.toLocaleString()} label="Open source" />
            <StatRow value="24 / 7" label="On chain" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StatRow({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex lg:flex-row-reverse items-center gap-3 lg:gap-4">
      <div className="lg:text-right">
        <p className="text-2xl lg:text-[1.75rem] font-semibold tracking-tight text-white tabular-nums">
          {value}
        </p>
        <p className="text-[11px] tracking-[0.14em] text-white/45 uppercase mt-0.5">
          {label}
        </p>
      </div>
    </div>
  );
}
