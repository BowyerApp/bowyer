"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/docs", label: "Build" },
  { href: "/docs/setup", label: "Setup & API" },
  { href: "/docs/sdk", label: "SDKs" },
];

/** Horizontal sub-navigation shared by all documentation pages. */
export function DocsNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-border pb-px">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "border-b-2 px-3 py-2.5 text-[13px] transition-colors -mb-px",
              active
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
