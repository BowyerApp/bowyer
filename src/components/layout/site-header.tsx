"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { SiteLogo } from "@/components/layout/site-logo";
import { WalletButton } from "@/components/layout/wallet-button";
import { openCommandPalette } from "@/components/marketplace/command-palette";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/marketplace", label: "Explore" },
  { href: "/arena", label: "Arena" },
  { href: "/launch", label: "Launch" },
  { href: "/portfolio", label: "Portfolio", requiresWallet: true },
  { href: "/docs", label: "Build" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { address } = useWallet();
  const nav = NAV.filter((item) => !item.requiresWallet || address);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
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
        </div>
      </div>
    </header>
  );
}
