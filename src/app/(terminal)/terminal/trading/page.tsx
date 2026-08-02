import type { Metadata } from "next";
import { TradingView } from "@/components/terminal/trading";

export const metadata: Metadata = {
  title: "Trading agents — BOWYER V2",
  description:
    "Deploy strategy agents on live Robinhood Chain data — simulation first, real on-chain execution when armed.",
};

export default function TradingPage() {
  return <TradingView />;
}
