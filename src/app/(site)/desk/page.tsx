import type { Metadata } from "next";
import { DeskExperience } from "@/components/desk/desk-experience";

export const metadata: Metadata = {
  title: "HOOD DESK — Stock Tokens on Robinhood Chain",
  description:
    "Live premium/discount board for Robinhood Chain Stock Tokens. Connect Robinhood Agentic Trading MCP. Optional research from BOWYER businesses.",
};

/**
 * Stock Token Desk — separate consumer brand from the BOWYER marketplace.
 * Read-only market board + Robinhood Trading MCP connect + BOWYER research feed.
 */
export default function DeskPage() {
  return <DeskExperience />;
}
