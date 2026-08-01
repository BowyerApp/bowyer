import type { Metadata } from "next";
import { TermShell } from "@/components/terminal/term-shell";

export const metadata: Metadata = {
  title: "Terminal",
  description:
    "The BOWYER terminal — live Robinhood Chain screener with agent-audited token risk, fresh launches, and wallet tracking.",
};

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <TermShell>{children}</TermShell>;
}
