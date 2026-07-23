"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, PhoneCall, Share2, Square } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import type { Agent3DControlHandle } from "@/components/agent/agent-3d-hero";
import { cn } from "@/lib/utils";

type CallPhase = "idle" | "recording" | "thinking" | "speaking" | "error";

interface Turn {
  role: "user" | "agent";
  text: string;
}

interface VoiceCallProps {
  slug: string;
  agentName: string;
  avatarControlRef?: React.RefObject<Agent3DControlHandle | null>;
  className?: string;
}

/**
 * Live voice conversation with the agent: hold to talk, the robot answers
 * out loud. Free daily teaser for visitors, unlimited for subscribers.
 */
export function VoiceCall({ slug, agentName, avatarControlRef, className }: VoiceCallProps) {
  const { address, authenticate } = useWallet();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  // Whether we've minted a wallet session this page-load (avoids re-prompting).
  const authedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const params = address ? `?wallet=${address}` : "";
    fetch(`/api/agents/${slug}/voice${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setAvailable(Boolean(data.available));
        setSubscribed(Boolean(data.subscribed));
        setFreeLeft(data.freeQuestionsLeft ?? null);
      })
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [slug, address]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, phase]);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const sendExchange = useCallback(
    async (audioBlob: Blob) => {
      setPhase("thinking");
      setError(null);

      const buildForm = (withWallet: boolean) => {
        const form = new FormData();
        const ext = audioBlob.type.includes("mp4") ? "mp4" : "webm";
        form.append("audio", audioBlob, `question.${ext}`);
        if (withWallet && address) form.append("wallet", address);
        return form;
      };

      try {
        let res = await fetch(`/api/agents/${slug}/voice`, {
          method: "POST",
          body: buildForm(Boolean(address)),
        });

        // No wallet session yet — sign once, then retry with the wallet attached.
        if (res.status === 401 && address && !authedRef.current) {
          const authed = await authenticate();
          authedRef.current = authed;
          res = await fetch(`/api/agents/${slug}/voice`, {
            method: "POST",
            body: buildForm(authed),
          });
        }

        const data = await res.json();
        if (res.status === 402) {
          setFreeLeft(0);
          setPhase("idle");
          setError("Free questions used for today — subscribe for unlimited calls.");
          return;
        }
        if (!res.ok) throw new Error(data.error ?? "Call failed");

        setTurns((prev) => [
          ...prev,
          { role: "user", text: data.question },
          { role: "agent", text: data.answer },
        ]);
        if (typeof data.freeQuestionsLeft === "number") setFreeLeft(data.freeQuestionsLeft);
        if (data.shareUrl) {
          setShareUrl(data.shareUrl as string);
          setCopied(false);
        }

        if (data.audio) {
          setPhase("speaking");
          avatarControlRef?.current?.playAnim("wave");
          const el = new Audio(data.audio as string);
          audioRef.current = el;
          el.onended = () => setPhase("idle");
          el.onerror = () => setPhase("idle");
          await el.play().catch(() => setPhase("idle"));
        } else {
          setPhase("idle");
        }
      } catch (e) {
        setPhase("error");
        setError(e instanceof Error ? e.message : "Call failed");
      }
    },
    [slug, address, authenticate, avatarControlRef]
  );

  const startRecording = useCallback(async () => {
    if (phase === "recording" || phase === "thinking") return;
    stopPlayback();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 2000) {
          void sendExchange(blob);
        } else {
          setPhase("idle");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setPhase("recording");
    } catch {
      setMicDenied(true);
      setPhase("idle");
    }
  }, [phase, sendExchange, stopPlayback]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  if (available === false || available === null) return null;

  const locked = !subscribed && freeLeft === 0;
  const busy = phase === "thinking";

  return (
    <div
      className={cn(
        "rounded-sm border border-border bg-surface/80 p-5 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <PhoneCall className="size-3.5 text-accent" strokeWidth={2} />
          Talk to {agentName}
        </p>
        <p className="text-[11.5px] text-subtle tabular-nums">
          {subscribed
            ? "Subscriber · unlimited"
            : freeLeft !== null
              ? `${freeLeft} free question${freeLeft === 1 ? "" : "s"} left today`
              : ""}
        </p>
      </div>

      {turns.length > 0 && (
        <div
          ref={transcriptRef}
          className="mt-4 max-h-[180px] space-y-2.5 overflow-y-auto pr-1"
        >
          {turns.map((turn, i) => (
            <p key={i} className="text-[13px] leading-relaxed">
              <span className={turn.role === "user" ? "text-subtle" : "text-accent"}>
                {turn.role === "user" ? "You" : agentName.split(" ")[0]}
              </span>{" "}
              <span className="text-muted">{turn.text}</span>
            </p>
          ))}
          {busy && (
            <p className="text-[13px] text-subtle">
              <span className="inline-block animate-pulse">Thinking…</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          disabled={locked || busy || phase === "speaking"}
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={stopRecording}
          onTouchStart={(e) => {
            e.preventDefault();
            void startRecording();
          }}
          onTouchEnd={stopRecording}
          className={cn(
            "inline-flex h-11 select-none items-center justify-center gap-2 rounded-sm px-6 text-[13.5px] font-medium transition-all",
            phase === "recording"
              ? "bg-negative text-white"
              : "bg-accent text-background hover:opacity-90",
            (locked || busy || phase === "speaking") && "opacity-50"
          )}
        >
          {phase === "recording" ? (
            <>
              <Square className="size-3.5" strokeWidth={2.5} />
              Release to send
            </>
          ) : (
            <>
              <Mic className="size-4" strokeWidth={2} />
              {busy ? "Thinking…" : phase === "speaking" ? "Speaking…" : "Hold to talk"}
            </>
          )}
        </button>
        {phase === "speaking" && (
          <button
            type="button"
            onClick={() => {
              stopPlayback();
              setPhase("idle");
            }}
            className="text-[12.5px] text-muted transition-colors hover:text-foreground"
          >
            Stop
          </button>
        )}
        {shareUrl && phase !== "recording" && (
          <button
            type="button"
            onClick={() => {
              const absolute = `${window.location.origin}${shareUrl}`;
              void navigator.clipboard?.writeText(absolute).then(() => setCopied(true));
            }}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-foreground"
          >
            <Share2 className="size-3.5" strokeWidth={2} />
            {copied ? "Link copied" : "Share this call"}
          </button>
        )}
      </div>

      {micDenied && (
        <p className="mt-3 text-[12px] text-negative">
          Microphone access is blocked — allow it in your browser to talk.
        </p>
      )}
      {error && <p className="mt-3 text-[12px] text-negative">{error}</p>}
      {locked && (
        <p className="mt-3 text-[12px] text-muted">
          Free questions reset daily.{" "}
          <a href="#subscribe" className="text-accent underline underline-offset-2">
            Subscribe for unlimited voice access
          </a>
          .
        </p>
      )}
    </div>
  );
}
