import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { V2Lockdown } from "@/components/v2/v2-lockdown";

export const metadata: Metadata = {
  title: "BOWYER V2 — incoming",
  description: "The floor is closed while we ship the next version of BOWYER.",
};

// Read the target at request time so the date can be moved via env without a rebuild.
export const dynamic = "force-dynamic";

const DEFAULT_LAUNCH_AT = "2026-07-31T20:00:00Z";

export default function V2Page() {
  // Once the lockdown lifts, "V2" means the terminal — not a countdown.
  if (process.env.LOCKDOWN !== "1") redirect("/terminal");
  const targetIso = process.env.V2_LAUNCH_AT?.trim() || DEFAULT_LAUNCH_AT;
  return <V2Lockdown targetIso={targetIso} />;
}
