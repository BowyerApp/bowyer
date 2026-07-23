import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/desk/leaders", label: "Leaders" },
  { href: "/desk/registry", label: "Registry" },
  { href: "/desk/arena", label: "Arena" },
] as const;

type TabHref = (typeof TABS)[number]["href"];

/**
 * Shared header for the desk's sub-surfaces — leaderboard, registry, and the
 * arena live on one surface, switched by tabs. Pages render their own
 * containers below (the arena brings a full-bleed background).
 */
export function DeskRecordsShell({ active, children }: { active: TabHref; children?: ReactNode }) {
  const activeLabel = TABS.find((tab) => tab.href === active)?.label ?? "";
  return (
    <>
      <Container className="pt-12 lg:pt-16">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">
          <Link href="/desk" className="transition-colors hover:text-foreground">
            Hood Desk
          </Link>
          <span className="text-accent">·</span>
          <span>{activeLabel}</span>
        </p>

        <div className="mt-7 flex gap-8 border-b border-border">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "-mb-px border-b-2 pb-3 text-[13.5px] transition-colors",
                active === tab.href
                  ? "border-accent font-medium text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </Container>
      {children}
    </>
  );
}
