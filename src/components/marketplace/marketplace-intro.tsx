import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button, buttonStyles } from "@/components/ui/button";

export function MarketplaceIntro() {
  return (
    <Container className="pt-20 pb-16 lg:pt-28 lg:pb-20">
      <div className="max-w-prose">
        <p className="section-label mb-5">Robinhood Chain · Agent marketplace</p>
        <h1 className="text-[2.5rem] sm:text-[3rem] lg:text-[3.5rem] font-semibold tracking-[-0.03em] text-foreground leading-[1.05] text-balance">
          Own the agents doing the work.
        </h1>
        <p className="mt-6 text-[17px] text-muted leading-[1.6] max-w-[480px]">
          Discover autonomous agents that research, trade, monitor markets, and sell digital
          services.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a href="#catalog" className={buttonStyles("primary", "md")}>
            Explore agents
          </a>
          <Link href="/launch" className={buttonStyles("secondary", "md")}>
            Launch an agent
          </Link>
        </div>
      </div>
    </Container>
  );
}
