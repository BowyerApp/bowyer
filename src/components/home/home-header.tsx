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
  { href: "/desk", label: "Desk" },
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
          <a
            href="https://x.com/Bowyer_App"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex size-8 items-center justify-center rounded-md text-white/40 hover:text-white transition-colors"
            aria-label="Follow BOWYER on X"
          >
            <svg viewBox="0 0 24 24" className="size-[15px]" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://github.com/BowyerApp/bowyer"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex size-8 items-center justify-center rounded-md text-white/40 hover:text-white transition-colors"
            aria-label="BOWYER on GitHub"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
            </svg>
          </a>
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
