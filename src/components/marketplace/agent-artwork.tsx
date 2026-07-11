import { cn } from "@/lib/utils";
import type { ArtworkStyle } from "@/lib/types";

interface AgentArtworkProps {
  style: ArtworkStyle;
  name: string;
  className?: string;
  variant?: "hero" | "card" | "thumb";
}

function hashName(name: string): number {
  return name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

const STYLE_ACCENTS: Record<ArtworkStyle, string> = {
  "data-viz": "#5B8A8A",
  abstract: "#7A6B8A",
  analyst: "#6B7A9A",
  symbolic: "#8A7A5B",
  machine: "#6A8A6B",
  typography: "#929292",
};

/** Editorial artwork — muted, style-specific, not avatar-style */
export function AgentArtwork({ style, name, className, variant = "card" }: AgentArtworkProps) {
  const seed = hashName(name);
  const accent = STYLE_ACCENTS[style];
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[#0E0E0E]",
        variant === "hero" && "aspect-[16/10] lg:aspect-auto lg:min-h-[360px]",
        variant === "card" && "aspect-[16/10]",
        variant === "thumb" && "aspect-square size-full",
        className
      )}
    >
      <StyleTexture style={style} seed={seed} accent={accent} />
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end",
          variant === "hero" ? "p-8 lg:p-10" : variant === "card" ? "p-5" : "p-3"
        )}
      >
        <span
          className={cn(
            "font-medium uppercase tracking-[0.14em] text-muted",
            variant === "hero" ? "text-[12px]" : "text-[10px]"
          )}
        >
          {style.replace("-", " ")}
        </span>
        <p
          className={cn(
            "font-semibold tracking-[-0.03em] text-foreground leading-none mt-2",
            variant === "hero" ? "text-[40px] lg:text-[56px]" : variant === "card" ? "text-[24px]" : "text-[16px]"
          )}
        >
          {initial}
        </p>
        <div className="mt-3 h-px bg-border" style={{ width: variant === "hero" ? 48 : 32 }} />
        <div className="absolute top-0 left-0 w-1 h-full opacity-80" style={{ backgroundColor: accent }} />
      </div>
    </div>
  );
}

function StyleTexture({
  style,
  seed,
  accent,
}: {
  style: ArtworkStyle;
  seed: number;
  accent: string;
}) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.35]" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="400" height="250" fill="#0E0E0E" />
      {style === "data-viz" &&
        Array.from({ length: 8 }, (_, i) => (
          <line
            key={i}
            x1={40 + i * 45}
            y1={200}
            x2={40 + i * 45 + ((seed + i) % 12) - 6}
            y2={60 + ((seed + i * 11) % 80)}
            stroke={accent}
            strokeWidth="0.75"
            opacity="0.6"
          />
        ))}
      {style === "abstract" &&
        Array.from({ length: 4 }, (_, i) => (
          <circle
            key={i}
            cx={80 + ((seed + i * 37) % 240)}
            cy={60 + ((seed + i * 23) % 120)}
            r={20 + (i % 3) * 12}
            fill={accent}
            opacity={0.08 + i * 0.04}
          />
        ))}
      {style === "machine" &&
        Array.from({ length: 5 }, (_, i) => {
          const x = 60 + i * 70;
          const y = 80 + ((seed + i) % 40);
          return (
            <g key={i}>
              {i > 0 && (
                <line x1={x - 70} y1={y} x2={x} y2={y + 20} stroke={accent} strokeWidth="0.5" opacity="0.4" />
              )}
              <circle cx={x} cy={y + 20} r="3" fill={accent} opacity="0.5" />
            </g>
          );
        })}
      {style === "analyst" && (
        <>
          <ellipse cx="200" cy="100" rx="60" ry="40" fill={accent} opacity="0.06" />
          <path d="M 140 180 Q 200 120 260 180" fill="none" stroke={accent} strokeWidth="0.75" opacity="0.3" />
        </>
      )}
      {style === "symbolic" && (
        <>
          <circle cx="200" cy="125" r="50" fill="none" stroke={accent} strokeWidth="0.75" opacity="0.25" />
          <circle cx="200" cy="125" r="8" fill={accent} opacity="0.2" />
        </>
      )}
      {style === "typography" && (
        <>
          <line x1="40" y1="200" x2="360" y2="200" stroke="#929292" strokeWidth="0.5" opacity="0.2" />
          <line x1="40" y1="180" x2="280" y2="180" stroke="#929292" strokeWidth="0.5" opacity="0.15" />
        </>
      )}
    </svg>
  );
}
