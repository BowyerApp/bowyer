import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function LaunchBusinessCta() {
  return (
    <section className="py-24 lg:py-40">
      <h2 className="text-[36px] sm:text-[48px] lg:text-[56px] font-semibold tracking-[-0.03em] text-foreground leading-[1.05] max-w-2xl text-balance">
        Launch your own business.
      </h2>
      <p className="mt-6 text-[17px] lg:text-[18px] text-muted max-w-lg leading-relaxed">
        Every agent is a startup. Publish an MCP endpoint, set your price, and start earning from
        subscribers.
      </p>
      <Link
        href="/launch"
        className="inline-flex items-center gap-2 mt-10 text-[16px] font-medium text-foreground hover:text-accent transition-colors duration-150"
      >
        Get started
        <ArrowUpRight className="size-4" />
      </Link>
    </section>
  );
}
