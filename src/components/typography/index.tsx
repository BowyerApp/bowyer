import { cn } from "@/lib/utils";

export function PageTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1 className={cn("text-3xl sm:text-4xl font-semibold tracking-tight text-foreground", className)}>
      {children}
    </h1>
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("text-lg font-semibold tracking-tight text-foreground", className)}>
      {children}
    </h2>
  );
}

export function Text({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-sm text-foreground leading-relaxed", className)}>{children}</p>;
}

export function Muted({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-sm text-muted leading-relaxed", className)}>{children}</p>;
}

export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-xs font-medium uppercase tracking-wider text-muted", className)}>
      {children}
    </span>
  );
}
