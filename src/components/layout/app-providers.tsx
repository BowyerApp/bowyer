"use client";

import { CommandPalette } from "@/components/marketplace/command-palette";
import { IntroTour } from "@/components/layout/intro-tour";
import { WalletProvider } from "@/lib/wallet-context";
import type { AgentSummary } from "@/lib/types";

interface AppProvidersProps {
  agents: AgentSummary[];
  children: React.ReactNode;
}

export function AppProviders({ agents, children }: AppProvidersProps) {
  return (
    <WalletProvider>
      {children}
      <CommandPalette agents={agents} />
      <IntroTour />
    </WalletProvider>
  );
}
