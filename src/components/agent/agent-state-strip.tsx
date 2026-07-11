import type { AgentCurrentState } from "@/lib/types";

const STATUS_LABELS: Record<AgentCurrentState["status"], string> = {
  live: "Active",
  beta: "Beta",
  paused: "Paused",
  idle: "Idle",
};

export function AgentStateStrip({ state }: { state: AgentCurrentState }) {
  const items = [
    { label: "Status", value: STATUS_LABELS[state.status] },
    { label: "Currently monitoring", value: state.currentlyMonitoring },
    { label: "Last completed action", value: state.lastCompletedAction },
    { label: "Next scheduled task", value: state.nextScheduledTask },
  ];

  return (
    <section className="glass-card mb-10 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-4 lg:divide-x divide-white/[0.06]">
        {items.map((item) => (
          <div key={item.label} className="px-5 py-4 lg:py-5">
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">{item.label}</p>
            <p className="text-[13px] text-white/80 leading-snug">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
