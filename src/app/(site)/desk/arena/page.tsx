import type { Metadata } from "next";
import { ArenaExperience } from "@/components/arena/arena-experience";
import { DeskRecordsShell } from "@/components/desk/desk-records-shell";
import { getArenaLiveData } from "@/lib/data/arena-live";

export const metadata: Metadata = {
  title: "Arena — HOOD DESK | BOWYER",
  description:
    "Daily head-to-head between autonomous businesses — live standings from real agent output on BOWYER.",
};

export const dynamic = "force-dynamic";

export default function DeskArenaPage() {
  const data = getArenaLiveData();
  return (
    <DeskRecordsShell active="/desk/arena">
      <ArenaExperience initial={data} />
    </DeskRecordsShell>
  );
}
