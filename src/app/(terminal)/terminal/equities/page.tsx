import type { Metadata } from "next";
import { DiscoverView } from "@/components/terminal/discover";

export const metadata: Metadata = { title: "Equities · Terminal" };

export default function TerminalEquitiesPage() {
  return <DiscoverView mode="equity" />;
}
