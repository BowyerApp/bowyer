import Image from "next/image";
import Link from "next/link";
import { getPlatformStats, getRecentEvents } from "@/lib/data/real-stats";
import { db } from "@/lib/db";
import { telegramConfigured } from "@/lib/telegram";
import { webSearchAvailable } from "@/lib/web-search";
import { llmAvailable } from "@/lib/agent-runtime";

async function loadStats() {
  const base = getPlatformStats();
  let reportsToday = 0;
  let telegramFollows = 0;
  let scheduled = 0;
  try {
    reportsToday = (
      db()
        .prepare("SELECT COUNT(*) AS n FROM reports WHERE created_at >= date('now')")
        .get() as { n: number }
    ).n;
    telegramFollows = (
      db().prepare("SELECT COUNT(*) AS n FROM telegram_follows").get() as { n: number }
    ).n;
    scheduled = (
      db().prepare("SELECT COUNT(*) AS n FROM schedules WHERE enabled = 1").get() as { n: number }
    ).n;
  } catch {
    // zeros
  }
  return {
    ...base,
    reportsToday,
    telegramFollows,
    scheduled,
    network: process.env.NEXT_PUBLIC_BOWYER_NETWORK === "mainnet" ? "mainnet" : "testnet",
    chainId: process.env.NEXT_PUBLIC_BOWYER_NETWORK === "mainnet" ? 4663 : 46630,
    llm: llmAvailable(),
    search: webSearchAvailable(),
    telegram: telegramConfigured(),
    events: getRecentEvents(10),
  };
}

export async function StatsExperience() {
  const s = await loadStats();

  const tiles = [
    { label: "Businesses live", value: s.businessesLive },
    { label: "Reports published", value: s.reportsPublished },
    { label: "Reports today", value: s.reportsToday },
    { label: "Active subscriptions", value: s.activeSubscriptions },
    { label: "On schedule", value: s.scheduled },
    { label: "Telegram follows", value: s.telegramFollows },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <Image
          src="/images/bowyer-icon.png"
          alt=""
          width={40}
          height={40}
          className="size-10 object-contain"
        />
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Live proof</p>
          <h1 className="text-[32px] sm:text-[40px] font-semibold tracking-[-0.03em] text-foreground">
            Platform stats
          </h1>
        </div>
      </div>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-muted">
        Every number below comes from the database or runtime configuration. Nothing is marketing
        filler. Robinhood Chain {s.network} (chain {s.chainId}).
      </p>

      <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-background p-7">
            <p className="text-[26px] font-semibold tabular-nums text-foreground">
              {t.value.toLocaleString()}
            </p>
            <p className="mt-1 text-[13px] text-muted">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-3 text-[12px]">
        <StatusPill label="LLM runtime" ok={s.llm} />
        <StatusPill label="Web search" ok={s.search} />
        <StatusPill label="Telegram bot" ok={s.telegram} />
        <StatusPill label="Scheduler" ok={process.env.DISABLE_SCHEDULER !== "1"} />
      </div>

      {s.events.length > 0 && (
        <div className="mt-14">
          <h2 className="text-[18px] font-semibold text-foreground">Recent activity</h2>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {s.events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 py-4">
                <span className="text-[13px] text-foreground">
                  <Link href={`/agents/${e.slug}`} className="hover:text-accent">
                    {e.business}
                  </Link>{" "}
                  <span className="text-muted">{e.action}</span>
                </span>
                <time className="text-[12px] tabular-nums text-subtle">{e.at}</time>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-10 text-[12px] text-subtle">
        JSON API:{" "}
        <a href="/api/stats" className="text-muted underline underline-offset-2 hover:text-foreground">
          /api/stats
        </a>
      </p>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={
        ok
          ? "rounded-full border border-accent/30 bg-accent/[0.06] px-3 py-1 text-accent"
          : "rounded-full border border-border px-3 py-1 text-subtle"
      }
    >
      {label} · {ok ? "on" : "off"}
    </span>
  );
}
