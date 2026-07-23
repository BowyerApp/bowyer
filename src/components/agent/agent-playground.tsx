"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Share2, Sparkles, Wand2, Zap } from "lucide-react";
import type { Agent3DControlHandle } from "@/components/agent/agent-3d-hero";
import { AvatarCreator } from "@/lib/avatar-creator";
import {
  getAgentPlayConfig,
  PLAY_CHALLENGES,
  type AvatarAnimation,
  type AvatarFx,
  type PlayChallengeId,
} from "@/lib/agent-playground";
import { mcpEndpointForSlug } from "@/lib/mcp-endpoint";
import { useOrigin } from "@/lib/use-origin";
import { cn } from "@/lib/utils";

interface AgentPlaygroundProps {
  slug: string;
  name: string;
  hasAvatar?: boolean;
  avatarControlRef?: React.RefObject<Agent3DControlHandle | null>;
  onAvatarUploaded?: (url: string) => void;
}

function storageKey(slug: string) {
  return `bowyer-play-${slug}`;
}

export function AgentPlayground({
  slug,
  name,
  hasAvatar = false,
  avatarControlRef,
  onAvatarUploaded,
}: AgentPlaygroundProps) {
  const config = useMemo(() => getAgentPlayConfig(slug), [slug]);
  const mcpUrl = mcpEndpointForSlug(slug, useOrigin());
  const [oracleLine, setOracleLine] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [done, setDone] = useState<Set<PlayChallengeId>>(new Set());
  const [studioBusy, setStudioBusy] = useState(false);
  const oracleIdx = useRef(0);
  const creatorRef = useRef<AvatarCreator | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(slug));
      if (raw) setDone(new Set(JSON.parse(raw) as PlayChallengeId[]));
    } catch {
      /* ignore */
    }
  }, [slug]);

  const markDone = useCallback(
    (id: PlayChallengeId) => {
      setDone((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        try {
          localStorage.setItem(storageKey(slug), JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [slug]
  );

  const copyText = useCallback(
    async (text: string, label: string, challenge?: PlayChallengeId) => {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1800);
      if (challenge) markDone(challenge);
    },
    [markDone]
  );

  const consultOracle = () => {
    const line = config.hotTakes[oracleIdx.current % config.hotTakes.length];
    oracleIdx.current += 1;
    setOracleLine(line);
    markDone("oracle");
  };

  const moods = config.moods ?? [];

  const openAvatarStudio = () => {
    creatorRef.current?.close();
    const creator = new AvatarCreator({
      studioUrl: "https://three.ws/create/studio",
      onExport: async (blob) => {
        setStudioBusy(true);
        try {
          const res = await fetch(`/api/agents/${slug}/avatar`, {
            method: "POST",
            body: blob,
          });
          const data = (await res.json()) as { url?: string; error?: string };
          if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
          onAvatarUploaded?.(data.url);
          markDone("mood");
        } catch (err) {
          console.error(err);
          alert("Could not save avatar. Try exporting again.");
        } finally {
          setStudioBusy(false);
        }
      },
    });
    creatorRef.current = creator;
    creator.open();
  };

  return (
    <section id="play" className="mt-10 rounded-sm border border-white/[0.08] bg-surface/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
            <Sparkles className="size-3.5" strokeWidth={2} />
            Playground
          </p>
          <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Things to try for fun
          </h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted">
            Rigged avatars from three.ws — wave, dance, and agent-specific effects. Or open Avatar
            Studio to design a custom body.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-[11px] text-muted">
          <span className="tabular-nums text-foreground">{done.size}</span>
          <span>/ {PLAY_CHALLENGES.length} tried</span>
        </div>
      </div>

      {hasAvatar && avatarControlRef && (moods.length > 0 || (config.avatarActions?.length ?? 0) > 0) && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-foreground">Avatar controls</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={studioBusy}
                onClick={openAvatarStudio}
                className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-[12px] text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
              >
                <ExternalLink className="size-3" strokeWidth={2} />
                {studioBusy ? "Saving…" : "Avatar Studio"}
              </button>
              {config.studioPrompt && (
                <button
                  type="button"
                  onClick={() => copyText(config.studioPrompt!, "studio-prompt")}
                  className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-white/20 hover:text-foreground"
                >
                  Copy studio prompt
                </button>
              )}
              <a
                href="https://three.ws/create/prompt"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-white/20 hover:text-foreground"
              >
                Prompt → 3D
              </a>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {moods.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => {
                  avatarControlRef.current?.setAccent(m.accent);
                  markDone("mood");
                }}
                className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-white/20 hover:text-foreground"
              >
                <span
                  className="size-2.5 rounded-full ring-1 ring-white/20"
                  style={{ backgroundColor: m.accent }}
                />
                {m.label}
              </button>
            ))}
            {(config.avatarActions ?? []).map((action) => (
              <button
                key={`${action.kind}-${action.id}`}
                type="button"
                onClick={() => {
                  if (action.kind === "fx") {
                    avatarControlRef.current?.playFx(action.id as AvatarFx);
                  } else {
                    avatarControlRef.current?.playAnim(action.id as AvatarAnimation);
                  }
                  markDone("mood");
                }}
                className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-white/20 hover:text-foreground"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Oracle */}
        <div className="rounded-sm border border-border bg-background/50 p-4">
          <p className="flex items-center gap-2 text-[12px] font-medium text-foreground">
            <Wand2 className="size-3.5 text-accent" strokeWidth={2} />
            {config.oracleLabel}
          </p>
          <p className="mt-3 min-h-[3.5rem] text-[14px] leading-relaxed text-muted">
            {oracleLine ?? "Press the button. The agent has opinions."}
          </p>
          <button
            type="button"
            onClick={consultOracle}
            className="mt-4 rounded-sm border border-accent/30 bg-accent/10 px-3 py-2 text-[12px] font-medium text-accent transition-colors hover:bg-accent/15"
          >
            Consult the oracle
          </button>
        </div>

        {/* Share + MCP */}
        <div className="rounded-sm border border-border bg-background/50 p-4">
          <p className="flex items-center gap-2 text-[12px] font-medium text-foreground">
            <Share2 className="size-3.5 text-accent" strokeWidth={2} />
            Share & connect
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionChip
              label="Copy MCP URL"
              active={copied === "mcp"}
              onClick={() => copyText(mcpUrl, "mcp", "mcp")}
            />
            <ActionChip
              label="Share on X"
              active={copied === "share"}
              onClick={() => {
                const text = config.shareTweet
                  .replaceAll("{name}", name)
                  .replaceAll("{slug}", slug);
                const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                window.open(url, "_blank", "noopener,noreferrer");
                markDone("share");
              }}
            />
            <ActionChip
              label="Copy ask JSON"
              active={copied === "ask-json"}
              onClick={() =>
                copyText(
                  JSON.stringify(
                    {
                      jsonrpc: "2.0",
                      id: 1,
                      method: "tools/call",
                      params: {
                        name: "ask",
                        arguments: { question: config.funPrompts[0]?.prompt ?? "Hello!" },
                      },
                    },
                    null,
                    2
                  ),
                  "ask-json"
                )
              }
            />
          </div>
          <p className="mt-3 font-mono text-[11px] text-subtle break-all">{mcpUrl}</p>
        </div>
      </div>

      {/* Fun prompts */}
      <div className="mt-6">
        <p className="flex items-center gap-2 text-[12px] font-medium text-foreground">
          <Zap className="size-3.5 text-accent" strokeWidth={2} />
          Fun prompts to ask
        </p>
        <p className="mt-1 text-[12px] text-muted">
          Paste into Cursor, Claude, or Telegram once subscribed — or use the{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px]">ask</code>{" "}
          MCP tool.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.funPrompts.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => copyText(item.prompt, item.label, "prompt")}
              className={cn(
                "group flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                copied === item.label
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-background/70 text-muted hover:border-white/20 hover:text-foreground"
              )}
            >
              {copied === item.label ? (
                <Check className="size-3" strokeWidth={2} />
              ) : (
                <Copy className="size-3 opacity-60 group-hover:opacity-100" strokeWidth={2} />
              )}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Challenge strip */}
      <div className="mt-6 border-t border-border pt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
          Agent bingo
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {PLAY_CHALLENGES.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex items-center gap-2 text-[12px]",
                done.has(c.id) ? "text-accent" : "text-muted"
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border text-[9px]",
                  done.has(c.id)
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-border text-transparent"
                )}
              >
                ✓
              </span>
              {c.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ActionChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border bg-background/70 text-muted hover:border-white/20 hover:text-foreground"
      )}
    >
      {active ? "Copied!" : label}
    </button>
  );
}
