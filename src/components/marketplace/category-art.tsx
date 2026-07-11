import { cn } from "@/lib/utils";
import type { CapabilityId } from "@/lib/data/marketplace-experience";
import { CAPABILITY_VISUAL, agentCapabilityId } from "@/lib/data/marketplace-experience";
import type { AgentSummary } from "@/lib/types";

interface CategoryArtProps {
  capability: CapabilityId;
  name: string;
  className?: string;
  size?: "feature" | "card" | "tile" | "carousel";
}

/** Unique visual language per capability — not generic letter tiles */
export function CategoryArt({ capability, name, className, size = "card" }: CategoryArtProps) {
  const visual = CAPABILITY_VISUAL[capability];
  const initial = name.charAt(0);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ backgroundColor: visual.bg }}
    >
      <CapabilityTexture capability={capability} accent={visual.accent} />
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end",
          size === "feature" && "p-10 lg:p-14",
          size === "card" && "p-6",
          size === "tile" && "p-8 lg:p-10",
          size === "carousel" && "p-5"
        )}
      >
        {size === "feature" && (
          <span className="text-[11px] uppercase tracking-[0.2em] mb-4" style={{ color: visual.accent }}>
            {capability}
          </span>
        )}
        <span
          className={cn(
            "font-semibold leading-none tracking-[-0.04em] text-[#F5F5F5]",
            size === "feature" && "text-[72px] lg:text-[120px]",
            size === "card" && "text-[48px]",
            size === "tile" && "text-[32px] lg:text-[40px]",
            size === "carousel" && "text-[36px]"
          )}
          style={{ opacity: 0.12 }}
          aria-hidden
        >
          {initial}
        </span>
      </div>
    </div>
  );
}

export function AgentCategoryArt({
  agent,
  className,
  size = "card",
}: {
  agent: AgentSummary;
  className?: string;
  size?: "feature" | "card" | "tile" | "carousel";
}) {
  return (
    <CategoryArt
      capability={agentCapabilityId(agent)}
      name={agent.name}
      className={className}
      size={size}
    />
  );
}

function CapabilityTexture({ capability, accent }: { capability: CapabilityId; accent: string }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {capability === "trading" && (
        <>
          <path d="M0 220 L80 180 L160 200 L240 120 L320 140 L400 80 L400 300 L0 300 Z" fill={accent} opacity="0.08" />
          <line x1="0" y1="220" x2="400" y2="80" stroke={accent} strokeWidth="0.5" opacity="0.25" />
        </>
      )}
      {capability === "research" && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={48 + i * 88} y={60 + i * 12} width={64} height="2" fill={accent} opacity={0.15 + i * 0.05} />
          ))}
          <rect x="48" y="100" width="280" height="120" fill="none" stroke={accent} strokeWidth="0.5" opacity="0.12" />
        </>
      )}
      {capability === "news" && (
        <>
          <rect x="40" y="48" width="320" height="8" fill={accent} opacity="0.2" />
          <rect x="40" y="72" width="240" height="4" fill={accent} opacity="0.1" />
          <rect x="40" y="88" width="280" height="4" fill={accent} opacity="0.08" />
        </>
      )}
      {capability === "macro" && (
        <ellipse cx="200" cy="150" rx="100" ry="100" fill="none" stroke={accent} strokeWidth="0.75" opacity="0.15" />
      )}
      {capability === "automation" && (
        <>
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1={40 + i * 64} y1="40" x2={40 + i * 64} y2="260" stroke={accent} strokeWidth="0.35" opacity="0.12" />
          ))}
        </>
      )}
      {capability === "developer" && (
        <>
          <text x="40" y="80" fill={accent} opacity="0.35" fontSize="14" fontFamily="monospace">{">"}</text>
          <rect x="56" y="68" width="120" height="2" fill={accent} opacity="0.3" />
          <rect x="40" y="100" width="80" height="2" fill={accent} opacity="0.15" />
        </>
      )}
      {capability === "security" && (
        <path d="M200 60 L280 100 L280 180 Q200 240 120 180 L120 100 Z" fill="none" stroke={accent} strokeWidth="0.75" opacity="0.2" />
      )}
      {capability === "content" && (
        <>
          <line x1="60" y1="200" x2="340" y2="200" stroke={accent} strokeWidth="1" opacity="0.15" />
          <line x1="60" y1="180" x2="260" y2="180" stroke={accent} strokeWidth="0.5" opacity="0.1" />
        </>
      )}
      {capability === "analytics" && (
        <>
          {Array.from({ length: 12 }, (_, i) => (
            <circle key={i} cx={40 + (i % 6) * 56} cy={80 + Math.floor(i / 6) * 80} r="2" fill={accent} opacity="0.25" />
          ))}
        </>
      )}
    </svg>
  );
}
