import type { AgentActivity } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

const TYPE_LABELS: Record<AgentActivity["type"], string> = {
  alert: "Alert",
  report: "Report",
  scan: "Scan",
  publish: "Publish",
};

export function ActivityList({ items }: { items: AgentActivity[] }) {
  return (
    <ul className="divide-y divide-border border-t border-border">
      {items.map((item) => (
        <li key={item.id} className="py-6 first:pt-6">
          <div className="flex items-start gap-6">
            <span className="meta-text w-16 shrink-0">{TYPE_LABELS[item.type]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-foreground leading-relaxed">{item.summary}</p>
              <p className="meta-text mt-2">{formatRelativeTime(item.timestamp)}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
