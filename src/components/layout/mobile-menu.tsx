"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MobileNavItem {
  href: string;
  label: string;
}

/** Hamburger + full-screen drawer nav, shown below the md breakpoint. */
export function MobileMenu({ items, light }: { items: MobileNavItem[]; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change and lock body scroll while open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex size-8 items-center justify-center transition-colors",
          light ? "text-white/60 hover:text-white" : "text-muted hover:text-foreground"
        )}
      >
        {open ? <X className="size-5" strokeWidth={1.75} /> : <Menu className="size-5" strokeWidth={1.75} />}
      </button>

      {open && (
        <div className="fixed inset-0 top-14 z-50 flex flex-col bg-background/98 backdrop-blur-md">
          <nav className="flex flex-col px-6 pt-6">
            {items.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center justify-between border-b border-border py-4 text-[17px] font-medium transition-colors",
                    active ? "text-accent" : "text-foreground"
                  )}
                >
                  {label}
                  <span aria-hidden className="text-subtle">→</span>
                </Link>
              );
            })}
          </nav>
          <p className="mt-auto px-6 pb-10 text-[11px] uppercase tracking-[0.14em] text-subtle">
            BOWYER · The App Store for Autonomous Businesses
          </p>
        </div>
      )}
    </div>
  );
}
