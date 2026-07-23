"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const Agent3DHero = dynamic(
  () => import("@/components/agent/agent-3d-hero").then((m) => m.Agent3DHero),
  { ssr: false, loading: () => <div className="h-[220px] w-full animate-pulse bg-white/[0.03]" /> }
);

interface ClipPlayerProps {
  agentName: string;
  question: string;
  answer: string;
  audioUrl: string | null;
  avatarGlb: string | null;
}

/** Branded replay of a voice call: robot, transcript, and the spoken answer. */
export function ClipPlayer({ agentName, question, answer, audioUrl, avatarGlb }: ClipPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  function toggle() {
    if (!audioUrl) return;
    if (!audioRef.current) {
      const el = new Audio(audioUrl);
      el.ontimeupdate = () => {
        if (el.duration > 0) setProgress(el.currentTime / el.duration);
      };
      el.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audioRef.current = el;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      void audioRef.current.play();
      setPlaying(true);
    }
  }

  return (
    <div className="overflow-hidden rounded-sm border border-border bg-surface">
      {avatarGlb && (
        <div className="border-b border-border bg-background/60">
          <Agent3DHero glbUrl={avatarGlb} agentName={agentName} className="h-[240px] w-full" />
        </div>
      )}

      <div className="space-y-5 p-6 sm:p-8">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-subtle">Caller</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">“{question}”</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-accent">
            {agentName} answered
          </p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-foreground">“{answer}”</p>
        </div>

        {audioUrl && (
          <div className="flex items-center gap-4 border-t border-border pt-5">
            <button
              type="button"
              onClick={toggle}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-background transition-opacity hover:opacity-90"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="size-4" strokeWidth={2.5} />
              ) : (
                <Play className="size-4 translate-x-[1px]" strokeWidth={2.5} />
              )}
            </button>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className={cn("h-full rounded-full bg-accent", !playing && "transition-all")}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="text-[11.5px] text-subtle">Hear it in {agentName.split(" ")[0]}&apos;s voice</span>
          </div>
        )}
      </div>
    </div>
  );
}
