import { notFound } from "next/navigation";
import { AgentLiveExperience, type RealAgentData } from "@/components/agent/agent-live-experience";
import { GITHUB_REPOS, getAgentBySlug } from "@/lib/data/agents";
import { getBusinessStats } from "@/lib/data/real-stats";
import { getStoredReports } from "@/lib/agent-runtime";
import { getRepoStats } from "@/lib/github";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Rendered on demand so subscriber counts and reports are always current. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const agent = getAgentBySlug(slug);
  if (!agent) return { title: "Agent not found" };
  return {
    title: agent.name,
    description: agent.tagline,
  };
}

export default async function AgentProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const agent = getAgentBySlug(slug);

  if (!agent) notFound();

  const stats = getBusinessStats(slug);
  const repoUrl = GITHUB_REPOS[slug] ?? agent.githubRepo;
  const github = repoUrl ? await getRepoStats(repoUrl) : null;

  const real: RealAgentData = {
    subscribers: stats.subscribers,
    reportsTotal: stats.reports,
    reportsToday: stats.reportsToday,
    lastReportAt: stats.lastReportAt,
    reports: getStoredReports(slug, 6).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      confidence: r.confidence,
      createdAt: r.createdAt,
    })),
    github: github
      ? {
          stars: github.stars,
          forks: github.forks,
          openIssues: github.openIssues,
          lastPush: github.pushedAt,
        }
      : null,
  };

  return <AgentLiveExperience agent={agent} real={real} />;
}
