"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { SiteLogo } from "@/components/layout/site-logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { WalletButton } from "@/components/layout/wallet-button";
import { openCommandPalette } from "@/components/marketplace/command-palette";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/arena", label: "Arena" },
  { href: "/launch", label: "Launch" },
  { href: "/portfolio", label: "Portfolio", requiresWallet: true },
  { href: "/docs", label: "Build" },
];

export function HomeHeader() {
  const pathname = usePathname();
  const { address } = useWallet();
  const nav = NAV.filter((item) => !item.requiresWallet || address);

  return (
    <header className="absolute top-0 left-0 right-0 z-50 px-6 lg:px-10 pt-6">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between">
        <SiteLogo />
        <nav className="hidden md:flex items-center gap-1">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-1.5 text-[12px] font-medium tracking-[0.06em] uppercase transition-colors rounded-md",
                pathname === href
                  ? "text-[#D7FF00] bg-[#D7FF00]/10"
                  : "text-white/50 hover:text-white"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-white/40 hover:text-white transition-colors"
            aria-label="Search"
            onClick={openCommandPalette}
          >
            <Search className="size-4" />
          </button>
          <WalletButton uppercase />
          <MobileMenu items={nav} light />
        </div>
      </div>
    </header>
  );
}
