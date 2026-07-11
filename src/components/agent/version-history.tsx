import type { AgentVersion } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface VersionHistoryProps {
  versions: AgentVersion[];
}

/** Adapted from skills-marketplace version history timeline */
export function VersionHistory({ versions }: VersionHistoryProps) {
  if (!versions.length) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-4">Version history</h2>
      <ol className="relative border-l border-white/[0.08] ml-2 space-y-5">
        {versions.map((v) => (
          <li key={v.version} className="pl-5">
            <span className="absolute -left-[5px] mt-1.5 size-2 rounded-full bg-[#D7FF00]" />
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-[13px] font-medium text-white font-mono">v{v.version}</span>
              <span className="text-[11px] text-white/30">{formatDate(v.date)}</span>
            </div>
            <p className="text-[13px] text-white/45 leading-relaxed">{v.changelog}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
