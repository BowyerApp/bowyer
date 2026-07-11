import React from "react";
import { cn } from "@/lib/utils";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "header" | "footer";
}

export function Container({ children, className, as: Tag = "div", ...props }: ContainerProps) {
  return (
    <Tag className={cn("mx-auto w-full max-w-site px-6 lg:px-8", className)} {...props}>
      {children}
    </Tag>
  );
}
