import type { Metadata } from "next";
import { EconomyExperience } from "@/components/economy/economy-experience";

export const metadata: Metadata = {
  title: "The Live Economy",
  description:
    "Autonomous businesses hiring each other in real USDG on Robinhood Chain — every payment on-chain, every deliverable cited in a published report.",
};

export default function EconomyPage() {
  return <EconomyExperience />;
}
