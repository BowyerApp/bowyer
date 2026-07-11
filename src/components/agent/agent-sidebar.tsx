import type { AgentProfile } from "@/lib/types";
import { PRICING_LABELS, formatAccessModel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { BadgeCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";

export function AgentSidebar({ agent }: { agent: AgentProfile }) {
  const { pricing, accessPlan, creator } = agent;
  const priceHeadline =
    pricing.model === "subscription"
      ? `$${pricing.amount} / ${pricing.period ?? "month"}`
      : `$${pricing.amount}`;

  return (
    <aside className="lg:sticky lg:top-24 space-y-10">
      <section className="pb-10 border-b border-border">
        <p className="section-label mb-2">{PRICING_LABELS[pricing.model]}</p>
        <p className="text-[32px] font-semibold text-foreground tracking-tight">{priceHeadline}</p>
        <ul className="mt-6 space-y-3">
          {accessPlan.included.map((item) => (
            <li key={item} className="text-[14px] text-muted leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
        <Button variant="primary" className="w-full mt-8" size="lg">
          Buy access
        </Button>
        <Button variant="ghost" className="w-full mt-2 text-muted" size="md">
          Follow for updates
        </Button>
        <p className="mt-6 text-[13px] text-subtle leading-relaxed">{accessPlan.termsNote}</p>
      </section>

      <section className="pb-10 border-b border-border">
        <h3 className="text-[15px] font-medium text-foreground mb-4">Not included</h3>
        <p className="text-[14px] text-muted leading-relaxed">
          Trade execution, portfolio management, or capital allocation. Investing through this agent
          is not supported on BOWYER.
        </p>
      </section>

      <section className="pb-10 border-b border-border">
        <h3 className="text-[15px] font-medium text-foreground mb-4">Creator</h3>
        <div className="flex items-center gap-2">
          <p className="text-[14px] text-foreground">{creator.name}</p>
          {creator.verified && <BadgeCheck className="size-4 text-accent" />}
        </div>
        <p className="meta-text mt-1">@{creator.handle}</p>
        {creator.bio && (
          <p className="text-[14px] text-muted mt-3 leading-relaxed">{creator.bio}</p>
        )}
        {creator.memberSince && (
          <p className="meta-text mt-3">Member since {formatDate(creator.memberSince)}</p>
        )}
      </section>

      <section className="pb-10 border-b border-border">
        <h3 className="text-[15px] font-medium text-foreground mb-3">Permissions</h3>
        <ul className="space-y-2">
          {agent.permissions.map((p) => (
            <li key={p} className="text-[14px] text-muted leading-relaxed">
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-[15px] font-medium text-foreground mb-3">Risk disclosure</h3>
        <p className="text-[14px] text-muted leading-relaxed">{agent.riskDisclosure}</p>
      </section>
    </aside>
  );
}
