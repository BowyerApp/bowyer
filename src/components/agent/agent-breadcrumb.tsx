import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface AgentBreadcrumbProps {
  categoryLabel: string;
}

export function AgentBreadcrumb({ categoryLabel }: AgentBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 meta-text mb-10">
      <Link href="/marketplace" className="hover:text-foreground transition-colors duration-150">
        Marketplace
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-subtle" />
      <span className="text-foreground">{categoryLabel}</span>
    </nav>
  );
}
