import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  className?: string;
  valueClassName?: string;
}

export function Stat({ label, value, sub, className, valueClassName }: StatProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted mb-1">{label}</dt>
      <dd className={cn("text-sm font-medium text-foreground tabular-nums", valueClassName)}>
        {value}
      </dd>
      {sub && <dd className="text-xs text-muted mt-0.5">{sub}</dd>}
    </div>
  );
}
