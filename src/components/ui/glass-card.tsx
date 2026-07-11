import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className, hover = false }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
        hover && "transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.14]",
        className
      )}
    >
      {children}
    </div>
  );
}
