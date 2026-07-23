"use client";

import { useEffect, useRef, useState } from "react";

interface QueueItem {
  id: number;
  audioUrl?: string | null;
}

/**
 * In-browser anchor voices for the on-site live channel.
 *
 * Muted until the viewer opts in (browser autoplay policy), then polls the
 * broadcast queue — `synth=1` so voices are only synthesized while someone
 * is actually listening — and plays each business's ElevenLabs clip in
 * order. Sits on top of the broadcast chrome as a small sound toggle.
 */
export function AnchorAudio() {
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const cursorRef = useRef(0);
  const playlistRef = useRef<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const pump = () => {
      if (cancelled || busyRef.current) return;
      const next = playlistRef.current.shift();
      if (!next) return;
      busyRef.current = true;
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = next;
      audio.volume = 1;
      const done = () => {
        setSpeaking(false);
        busyRef.current = false;
        // A breath between anchors, like a real rundown.
        window.setTimeout(pump, 1400);
      };
      audio.onended = done;
      audio.onerror = done;
      audio
        .play()
        .then(() => setSpeaking(true))
        .catch(done);
    };

    const poll = async (bootstrap: boolean) => {
      try {
        const res = await fetch(
          `/api/broadcast/queue?since=${cursorRef.current}&synth=1`
        );
        if (!res.ok || cancelled) return;
        const data: { items?: QueueItem[] } = await res.json();
        const items = data.items ?? [];
        if (items.length === 0) return;
        if (bootstrap) {
          // Join the channel now — never replay the backlog.
          cursorRef.current = Math.max(...items.map((i) => i.id));
          return;
        }
        for (const item of [...items].sort((a, b) => a.id - b.id)) {
          if (!item.audioUrl) continue; // voiced on a later poll
          cursorRef.current = Math.max(cursorRef.current, item.id);
          playlistRef.current.push(item.audioUrl);
        }
        pump();
      } catch {
        /* next poll retries */
      }
    };

    poll(true);
    const interval = window.setInterval(() => poll(false), 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      playlistRef.current = [];
      busyRef.current = false;
      audioRef.current?.pause();
      setSpeaking(false);
    };
  }, [enabled]);

  return (
    <button
      type="button"
      onClick={() => setEnabled((v) => !v)}
      className="fixed bottom-16 right-6 z-[70] flex items-center gap-2.5 rounded-sm border border-white/15 bg-black/75 px-4 py-2.5 font-mono text-[11.5px] uppercase tracking-[0.18em] backdrop-blur-sm transition-colors hover:border-white/30"
    >
      {enabled ? (
        <>
          <span
            className={`size-1.5 rounded-full ${speaking ? "animate-pulse bg-[#b8ff2e]" : "bg-[#b8ff2e]/60"}`}
          />
          <span className="text-white/90">
            {speaking ? "Anchor on air" : "Sound on"}
          </span>
        </>
      ) : (
        <>
          <span className="size-1.5 rounded-full bg-white/40" />
          <span className="text-white/75">Sound off — hear the anchors</span>
        </>
      )}
    </button>
  );
}
