import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { ClipPlayer } from "@/components/clips/clip-player";
import { FREE_VOICE_QUESTIONS_PER_DAY, getVoiceClip } from "@/lib/voice";
import { getAgentSummary } from "@/lib/data/agents";
import { getAgentAvatarGlb } from "@/lib/agent-avatars";

export const dynamic = "force-dynamic";

function parseRef(ref: string): { id: number; token: string } | null {
  const match = /^(\d+)-([a-f0-9]{24})$/.exec(ref);
  if (!match) return null;
  return { id: Number(match[1]), token: match[2] };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  const parsed = parseRef(ref);
  const clip = parsed ? getVoiceClip(parsed.id, parsed.token) : null;
  const agent = clip ? getAgentSummary(clip.slug) : null;
  if (!clip || !agent) return { title: "Voice clip | BOWYER" };
  return {
    title: `${agent.name} answers: "${clip.question.slice(0, 60)}" | BOWYER`,
    description: clip.answer.slice(0, 160),
    openGraph: {
      title: `I just called ${agent.name} — an autonomous AI business`,
      description: clip.answer.slice(0, 200),
    },
  };
}

export default async function ClipPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const parsed = parseRef(ref);
  const clip = parsed ? getVoiceClip(parsed.id, parsed.token) : null;
  if (!clip || !parsed) notFound();
  const agent = getAgentSummary(clip.slug);
  if (!agent) notFound();

  const audioUrl = clip.hasAudio ? `/api/clips/${clip.id}?token=${parsed.token}` : null;
  const avatarGlb = getAgentAvatarGlb(agent);

  return (
    <Container className="pt-14 lg:pt-20 pb-24">
      <div className="mx-auto max-w-[640px]">
        <p className="flex items-center justify-center gap-2 text-[13px] text-muted">
          <span className="size-1.5 rounded-full bg-accent" />
          Live voice call · BOWYER
        </p>
        <h1 className="mt-4 text-center text-[28px] sm:text-[36px] font-semibold tracking-[-0.02em] leading-tight text-foreground">
          {agent.name} took this call
        </h1>
        <p className="mt-2 text-center text-[14px] text-muted">{agent.tagline}</p>

        <div className="mt-10">
          <ClipPlayer
            agentName={agent.name}
            question={clip.question}
            answer={clip.answer}
            audioUrl={audioUrl}
            avatarGlb={avatarGlb}
          />
        </div>

        <div className="mt-10 text-center">
          <Link
            href={`/agents/${agent.slug}`}
            className="inline-flex h-12 items-center justify-center rounded-sm bg-accent px-10 text-[15px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Call {agent.name.split(" ")[0]} yourself
          </Link>
          <p className="mt-3 text-[12px] text-subtle">
            Every agent on BOWYER takes live voice calls — {FREE_VOICE_QUESTIONS_PER_DAY} free
            questions a day.
          </p>
        </div>
      </div>
    </Container>
  );
}
