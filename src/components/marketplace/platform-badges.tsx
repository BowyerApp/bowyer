import { getPlatformInfo } from "@/lib/platforms";
import type { AgentPlatform } from "@/lib/types";

interface PlatformBadgesProps {
  platforms: AgentPlatform[];
  max?: number;
}

/** Adapted from dukelyuu/skills-marketplace PlatformBadges */
export function PlatformBadges({ platforms, max = 4 }: PlatformBadgesProps) {
  if (!platforms.length) return null;

  const displayed = platforms.slice(0, max);
  const remaining = platforms.length - max;

  return (
    <div className="flex items-center gap-1">
      {displayed.map((pid) => {
        const p = getPlatformInfo(pid);
        return (
          <span
            key={pid}
            title={p.name}
            className="inline-flex items-center justify-center w-5 h-4 rounded border border-border bg-elevated text-[8px] font-semibold text-muted"
          >
            {p.short}
          </span>
        );
      })}
      {remaining > 0 && (
        <span className="text-[10px] text-subtle" title={platforms.slice(max).map(getPlatformInfo).map((p) => p.name).join(", ")}>
          +{remaining}
        </span>
      )}
    </div>
  );
}
