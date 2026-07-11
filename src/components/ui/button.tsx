import React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-background font-medium hover:opacity-90 active:opacity-80",
  secondary: "bg-transparent text-foreground border border-border hover:border-white/20",
  ghost: "text-muted hover:text-foreground",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-sm gap-1.5",
  md: "h-10 px-4 text-[14px] rounded-sm gap-2",
  lg: "h-11 px-5 text-[15px] rounded-sm gap-2",
};

export function buttonStyles(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string
) {
  return cn(
    "inline-flex items-center justify-center transition-opacity duration-150",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40",
    "disabled:pointer-events-none disabled:opacity-40",
    variants[variant],
    sizes[size],
    className
  );
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  asChild,
  children,
  ...props
}: ButtonProps) {
  const classes = buttonStyles(variant, size, className);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: cn(classes, (children as React.ReactElement<{ className?: string }>).props.className),
    });
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
