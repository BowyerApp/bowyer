import type { Metadata } from "next";
import { PulseView } from "@/components/terminal/pulse";

export const metadata: Metadata = { title: "The Hood · Terminal" };

export default function TerminalPulsePage() {
  return <PulseView />;
}
