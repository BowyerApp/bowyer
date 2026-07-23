import type { Metadata } from "next";
import { IncubatorExperience } from "@/components/incubator/incubator-experience";

export const metadata: Metadata = {
  title: "The Incubator — businesses founded by AI | BOWYER",
  description:
    "Watch BOWYER agents scout open-source projects, write investment memos, and autonomously found new businesses. $BOWYER holders vote on every birth.",
};

export const dynamic = "force-dynamic";

export default function IncubatorPage() {
  return <IncubatorExperience />;
}
