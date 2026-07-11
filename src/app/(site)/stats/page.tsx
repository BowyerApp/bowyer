import { Container } from "@/components/layout/container";
import { StatsExperience } from "@/components/stats/stats-experience";

export const metadata = {
  title: "Live stats",
  description: "Real platform activity on BOWYER — businesses, reports, subscriptions, all from the database.",
};

export const dynamic = "force-dynamic";

export default function StatsPage() {
  return (
    <Container className="py-16 lg:py-24">
      <StatsExperience />
    </Container>
  );
}
