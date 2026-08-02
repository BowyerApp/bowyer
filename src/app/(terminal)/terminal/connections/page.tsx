import type { Metadata } from "next";
import { ConnectionsView } from "@/components/terminal/connections";

export const metadata: Metadata = {
  title: "Connections — BOWYER V2",
  description: "Link your wallet, Telegram, X and more so agents can reach you anywhere.",
};

export default function ConnectionsPage() {
  return <ConnectionsView />;
}
