import { Suspense } from "react";
import { LaunchExperience } from "@/components/launch/launch-experience";

export const metadata = { title: "Launch" };

export default function LaunchPage() {
  return (
    <Suspense fallback={null}>
      <LaunchExperience />
    </Suspense>
  );
}
