import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export function MarketplaceCta() {
  return (
    <section className="border-t border-border">
      <Container className="py-18 lg:py-24">
        <div className="max-w-prose">
          <p className="section-label mb-4">For builders</p>
          <h2 className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-[-0.03em] text-foreground leading-tight">
            Build the next autonomous business.
          </h2>
          <div className="mt-7">
            <Button variant="primary" size="md" asChild>
              <Link href="/launch">Launch your agent</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
