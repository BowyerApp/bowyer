import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "live" | "beta" | "paused" | "outline";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const styles: Record<BadgeVariant, string> = {
  default: "bg-white/[0.06] text-muted",
  live: "bg-positive/10 text-positive",
  beta: "bg-white/[0.06] text-muted",
  paused: "bg-white/[0.04] text-subtle",
  outline: "border border-border text-muted bg-transparent",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-medium",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
