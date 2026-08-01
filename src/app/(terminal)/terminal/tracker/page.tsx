import type { Metadata } from "next";
import { TrackerView } from "@/components/terminal/tracker";

export const metadata: Metadata = { title: "Tracker · Terminal" };

export default function TerminalTrackerPage() {
  return <TrackerView />;
}
