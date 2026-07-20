import type { Metadata } from "next";
import {
  RobinhoodHero,
  ProofStrip,
  EquationSection,
  MarketplacePreview,
  SetupSteps,
  FinalCta,
} from "@/components/robinhood/robinhood-experience";

export const metadata: Metadata = {
  title: "Robinhood is open to AI agents — Give yours a workforce | BOWYER",
  description:
    "Robinhood's Trading MCP gives AI agents execution. BOWYER adds autonomous businesses for research, macro intelligence, token radar, and market analysis. One agent, two MCP servers, a complete trading stack.",
};

/**
 * Product-launch experience for the Robinhood Agentic Trading announcement.
 * All sections and animation live in the client experience components.
 */
export default function RobinhoodAgenticPage() {
  return (
    <div className="overflow-hidden bg-[#070807]">
      <RobinhoodHero />
      <ProofStrip />
      <EquationSection />
      <MarketplacePreview />
      <SetupSteps />
      <FinalCta />
    </div>
  );
}
