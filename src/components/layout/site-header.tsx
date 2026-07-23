"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Search } from "lucide-react";
import { SiteLogo } from "@/components/layout/site-logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { WalletButton } from "@/components/layout/wallet-button";
import { openCommandPalette } from "@/components/marketplace/command-palette";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  requiresWallet?: boolean;
}

/** The real-time surfaces live together under one menu — keeps the bar calm. */
const LIVE_GROUP: { href: string; label: string; hint: string }[] = [
  { href: "/live", label: "Live channel", hint: "24/7 auto-directed broadcast" },
  { href: "/floor", label: "Trading floor", hint: "walk the room yourself" },
  { href: "/economy", label: "Economy", hint: "who's hiring whom" },
];

const NAV: NavLink[] = [
  { href: "/marketplace", label: "Explore" },
  { href: "/desk", label: "Desk" },
  { href: "/incubator", label: "Incubator" },
  { href: "/launch", label: "Launch" },
  { href: "/portfolio", label: "Portfolio", requiresWallet: true },
  { href: "/docs", label: "Build" },
];

function LiveMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const groupActive = LIVE_GROUP.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  const enter = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 text-[13px] transition-colors duration-150",
          groupActive || open ? "text-foreground" : "text-muted hover:text-foreground"
        )}
      >
        {groupActive && <span className="size-1.5 rounded-full bg-accent" aria-hidden />}
        Live
        <ChevronDown
          className={cn("size-3 transition-transform duration-150", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 w-[240px] -translate-x-1/2 pt-3">
          <div className="overflow-hidden rounded-sm border border-border bg-background/98 shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-md">
            {LIVE_GROUP.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block px-4 py-3 transition-colors hover:bg-surface",
                    active && "bg-surface/60"
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-[13px]",
                      active ? "text-accent" : "text-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-subtle">{item.hint}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { address } = useWallet();
  const nav = NAV.filter((item) => !item.requiresWallet || address);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mobile gets the flat list — drawers don't need grouping.
  const mobileItems = [
    ...nav.slice(0, 2),
    ...LIVE_GROUP.map(({ href, label }) => ({ href, label })),
    ...nav.slice(2),
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,border-color] duration-200",
        scrolled
          ? "border-b border-border bg-background/95 backdrop-blur-sm"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="max-w-site mx-auto px-6 lg:px-8 grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-4">
        <SiteLogo />

        <nav className="hidden md:flex items-center justify-center gap-7">
          {nav.slice(0, 2).map(({ href, label }) => (
            <HeaderLink key={href} href={href} label={label} pathname={pathname} />
          ))}
          <LiveMenu pathname={pathname} />
          {nav.slice(2).map(({ href, label }) => (
            <HeaderLink key={href} href={href} label={label} pathname={pathname} />
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="flex size-8 items-center justify-center text-muted hover:text-foreground transition-colors duration-150"
            aria-label="Search"
            onClick={openCommandPalette}
          >
            <Search className="size-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="hidden sm:flex size-8 items-center justify-center text-muted hover:text-foreground transition-colors duration-150"
            aria-label="Notifications"
          >
            <Bell className="size-4" strokeWidth={1.75} />
          </button>
          <WalletButton />
          <MobileMenu items={mobileItems} />
        </div>
      </div>
    </header>
  );
}

function HeaderLink({
  href,
  label,
  pathname,
}: {
  href: string;
  label: string;
  pathname: string;
}) {
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px] transition-colors duration-150",
        active ? "text-foreground" : "text-muted hover:text-foreground"
      )}
    >
      {active && <span className="size-1.5 rounded-full bg-accent" aria-hidden />}
      {label}
    </Link>
  );
}
