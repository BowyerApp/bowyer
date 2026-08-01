"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Radar,
  Activity,
  LineChart,
  Wallet,
  Store,
  Briefcase,
  FlaskConical,
  Radio,
  Network,
  ArrowUpRight,
  Search,
  CandlestickChart,
  Landmark,
} from "lucide-react";
import { BOWYER_TOKEN } from "@/lib/market-data";

const TRADE_NAV = [
  { href: "/terminal", label: "Discover", icon: Radar, exact: true },
  { href: "/terminal/pulse", label: "The Hood", icon: Activity },
  { href: "/terminal/equities", label: "Equities", icon: Landmark },
  { href: "/terminal/tracker", label: "Tracker", icon: Wallet },
];

const TRADE_SOON = [
  { label: "Perps", icon: CandlestickChart },
  { label: "Yield", icon: LineChart },
];

const AGENT_NAV = [
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/desk", label: "Desk", icon: Briefcase },
  { href: "/incubator", label: "Incubator", icon: FlaskConical },
  { href: "/live", label: "Live channel", icon: Radio },
  { href: "/economy", label: "Economy", icon: Network },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Radar;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
        active
          ? "bg-raised text-foreground"
          : "text-muted hover:bg-raised/60 hover:text-foreground"
      }`}
    >
      <Icon size={15} strokeWidth={1.8} className={active ? "text-accent" : ""} />
      {label}
    </Link>
  );
}

function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  const go = () => {
    const trimmed = value.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      router.push(`/terminal/t/${trimmed.toLowerCase()}`);
      setValue("");
    } else if (trimmed) {
      setInvalid(true);
      setTimeout(() => setInvalid(false), 1600);
    }
  };

  return (
    <div className="relative w-full max-w-md">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder="Paste a token address (0x…)"
        spellCheck={false}
        className={`w-full rounded-md border bg-raised py-2 pl-9 pr-3 font-mono-num text-[12px] text-foreground placeholder:text-subtle focus:outline-none ${
          invalid ? "border-[#f45d7e]/60" : "border-border focus:border-accent/40"
        }`}
      />
      {invalid && (
        <div className="absolute left-0 top-full mt-1 text-[10.5px] text-down">
          Not a token address — expected 0x followed by 40 hex characters.
        </div>
      )}
    </div>
  );
}

export function TermShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const nav = (
    <>
      <div className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
        Trade
      </div>
      {TRADE_NAV.map((item) => (
        <NavLink key={item.href} {...item} active={isActive(item.href, item.exact)} />
      ))}
      {TRADE_SOON.map((item) => (
        <div
          key={item.label}
          className="flex cursor-default items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-subtle"
        >
          <item.icon size={15} strokeWidth={1.8} />
          {item.label}
          <span className="ml-auto rounded border border-border px-1 py-px text-[9px] uppercase tracking-wide">
            soon
          </span>
        </div>
      ))}
      <div className="px-3 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
        Agents
      </div>
      {AGENT_NAV.map((item) => (
        <NavLink key={item.href} {...item} active={isActive(item.href)} />
      ))}
    </>
  );

  return (
    <div className="term flex min-h-screen flex-col text-foreground">
      {/* top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-ink/95 px-4 backdrop-blur">
        <Link href="/terminal" className="flex shrink-0 items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-tight">BOWYER</span>
          <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
            V2
          </span>
        </Link>
        <div className="hidden flex-1 justify-center md:flex">
          <SearchBox />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-[12px]">
          <Link
            href={`/terminal/t/${BOWYER_TOKEN}`}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-raised px-2.5 py-1.5 text-muted transition-colors hover:text-foreground sm:flex"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            $BOWYER
          </Link>
          <a
            href="https://robinhoodchain.blockscout.com"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1 text-muted transition-colors hover:text-foreground lg:flex"
          >
            Explorer <ArrowUpRight size={12} />
          </a>
          <Link href="/" className="text-muted transition-colors hover:text-foreground">
            Back to V1
          </Link>
        </div>
      </header>

      <div className="flex flex-1">
        {/* sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 flex-col overflow-y-auto border-r border-border bg-ink px-2 pb-6 lg:flex">
          {nav}
          <div className="mt-auto px-3 pt-6 text-[10px] leading-relaxed text-subtle">
            Live data from Robinhood Chain, DexScreener and Blockscout. Not financial advice.
          </div>
        </aside>

        {/* mobile nav strip */}
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-ink/95 py-2 backdrop-blur lg:hidden">
          {TRADE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 text-[10px] ${
                isActive(item.href, item.exact) ? "text-accent" : "text-muted"
              }`}
            >
              <item.icon size={17} strokeWidth={1.8} />
              {item.label}
            </Link>
          ))}
        </div>

        <main className="min-w-0 flex-1 bg-ink pb-20 lg:pb-0">{children}</main>
      </div>
    </div>
  );
}
