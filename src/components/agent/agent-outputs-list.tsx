import type { AgentOutput } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

export function AgentOutputsList({
  outputs,
  title = "Recent reports",
}: {
  outputs: AgentOutput[];
  title?: string;
}) {
  return (
    <section>
      <h2 className="text-[22px] font-semibold text-foreground mb-6">{title}</h2>
      <ul className="divide-y divide-border border-t border-border">
        {outputs.map((output) => (
          <li key={output.id} className="py-6 first:pt-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                  <h3 className="text-[15px] font-medium text-foreground">{output.title}</h3>
                  <span className="meta-text">{formatRelativeTime(output.timestamp)}</span>
                </div>
                <p className="text-[15px] text-muted leading-relaxed">{output.summary}</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground transition-colors shrink-0"
              >
                Open report
                <ArrowUpRight className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
