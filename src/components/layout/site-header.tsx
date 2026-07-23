"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { SiteLogo } from "@/components/layout/site-logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { WalletButton } from "@/components/layout/wallet-button";
import { openCommandPalette } from "@/components/marketplace/command-palette";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/marketplace", label: "Explore" },
  { href: "/desk", label: "Desk" },
  { href: "/floor", label: "Floor" },
  { href: "/incubator", label: "Incubator" },
  { href: "/launch", label: "Launch" },
  { href: "/portfolio", label: "Portfolio", requiresWallet: true },
  { href: "/docs", label: "Build" },
];

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
          {nav.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 text-[13px] transition-colors duration-150",
                  active ? "text-foreground" : "text-muted hover:text-foreground"
                )}
              >
                {active && (
                  <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                )}
                {label}
              </Link>
            );
          })}
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
          <MobileMenu items={nav} />
        </div>
      </div>
    </header>
  );
}
