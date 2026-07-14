"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { THREE_WS_AGENT_CDN } from "@/lib/agent-avatars";
import type { AvatarAnimation, AvatarFx } from "@/lib/agent-playground";
import { cn } from "@/lib/utils";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "agent-3d": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          body?: string;
          src?: string;
          brain?: string;
          mode?: string;
        },
        HTMLElement
      >;
    }
  }
}

type Agent3DElement = HTMLElement & {
  play?: (clip: string) => Promise<void>;
  wave?: (opts?: { style?: string }) => Promise<void>;
  lookAt?: (target: string) => Promise<void>;
  destroy?: () => void;
};

const FX_MS: Record<AvatarFx, number> = {
  "turntable-boost": 1400,
  "whale-breach": 2200,
  "sonar-ping": 1800,
  "bull-pulse": 1200,
  "radar-sweep": 1600,
  "research-flash": 1000,
  "gear-spin": 1300,
};

const CLIP_ALIASES: Record<AvatarAnimation, string[]> = {
  wave: ["wave", "Wave", "waving", "Waving", "hello", "Hello"],
  dance: ["dance", "Dance", "samba", "Samba", "shuffle", "Shuffle Dance"],
  celebrate: ["celebrate", "Celebrate", "celebration", "Celebrating", "cheering", "Cheering"],
  jump: ["jump", "Jump", "jumping", "Jumping"],
};

export interface Agent3DControlHandle {
  setAccent: (hex: string) => void;
  playFx: (fx: AvatarFx) => void;
  playAnim: (anim: AvatarAnimation) => void;
}

let scriptLoad: Promise<void> | null = null;

function resolveGlbUrl(glbUrl: string): string {
  if (glbUrl.startsWith("http://") || glbUrl.startsWith("https://")) return glbUrl;
  if (typeof window === "undefined") return glbUrl;
  return new URL(glbUrl, window.location.origin).href;
}

function loadAgent3DScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("agent-3d")) return Promise.resolve();
  if (scriptLoad) return scriptLoad;
  scriptLoad = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${THREE_WS_AGENT_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("agent-3d script failed")));
      return;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = THREE_WS_AGENT_CDN;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("agent-3d script failed"));
    document.head.appendChild(script);
  });
  return scriptLoad;
}

interface Agent3DHeroProps {
  glbUrl: string;
  agentName: string;
  className?: string;
  fallback?: ReactNode;
  variant?: "hero" | "card";
}

function FxOverlay({ fx }: { fx: AvatarFx | null }) {
  if (!fx) return null;
  if (fx === "whale-breach") {
    return (
      <>
        <div aria-hidden className="avatar-fx-whale-splash" />
        <div aria-hidden className="avatar-fx-whale-rise">
          <span className="text-[42px] leading-none drop-shadow-[0_8px_24px_rgba(34,211,238,0.45)]">🐋</span>
        </div>
        <div aria-hidden className="avatar-fx-whale-foam" />
      </>
    );
  }
  if (fx === "sonar-ping") {
    return (
      <>
        <div aria-hidden className="avatar-fx-sonar avatar-fx-sonar-1" />
        <div aria-hidden className="avatar-fx-sonar avatar-fx-sonar-2" />
        <div aria-hidden className="avatar-fx-sonar avatar-fx-sonar-3" />
      </>
    );
  }
  if (fx === "radar-sweep") return <div aria-hidden className="avatar-fx-radar" />;
  if (fx === "bull-pulse") return <div aria-hidden className="avatar-fx-bull-glow" />;
  if (fx === "research-flash") return <div aria-hidden className="avatar-fx-flash" />;
  if (fx === "gear-spin") {
    return (
      <div aria-hidden className="avatar-fx-gear-ring">
        <span className="text-[28px] opacity-70">⚙️</span>
      </div>
    );
  }
  return null;
}

export const Agent3DHero = forwardRef<Agent3DControlHandle, Agent3DHeroProps>(
  function Agent3DHero({ glbUrl, agentName, className, fallback, variant = "hero" }, controlRef) {
    const shellRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const agentElRef = useRef<Agent3DElement | null>(null);
    const fxTimer = useRef<number | null>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [fx, setFx] = useState<AvatarFx | null>(null);
    const [animPulse, setAnimPulse] = useState<AvatarAnimation | null>(null);

    async function runAnim(anim: AvatarAnimation) {
      const el = agentElRef.current;
      if (!el) return;
      setAnimPulse(anim);
      window.setTimeout(() => setAnimPulse(null), 900);
      try {
        if (anim === "wave" && el.wave) {
          await el.wave({ style: "enthusiastic" });
          return;
        }
        if (el.play) {
          for (const clip of CLIP_ALIASES[anim]) {
            try {
              await el.play(clip);
              return;
            } catch {
              /* try next clip name */
            }
          }
        }
        if (el.lookAt) await el.lookAt("user");
      } catch {
        /* rigged clip may be unavailable on this build */
      }
    }

    useImperativeHandle(controlRef, () => ({
      setAccent(hex: string) {
        agentElRef.current?.style.setProperty("--agent-accent", hex);
        shellRef.current?.style.setProperty("--play-accent", hex);
      },
      playFx(nextFx: AvatarFx) {
        if (fxTimer.current) window.clearTimeout(fxTimer.current);
        setFx(null);
        requestAnimationFrame(() => {
          setFx(nextFx);
          if (nextFx === "turntable-boost") void runAnim("dance");
          fxTimer.current = window.setTimeout(() => setFx(null), FX_MS[nextFx]);
        });
      },
      playAnim(anim: AvatarAnimation) {
        void runAnim(anim);
      },
    }));

    useEffect(() => {
      let cancelled = false;

      void loadAgent3DScript()
        .then(() => {
          if (cancelled || !hostRef.current) return;
          hostRef.current.innerHTML = "";
          const el = document.createElement("agent-3d") as Agent3DElement;
          el.setAttribute("body", resolveGlbUrl(glbUrl));
          el.setAttribute("brain", "none");
          el.setAttribute("mode", "section");
          el.setAttribute("kiosk", "");
          el.setAttribute("auto-rotate", "");
          if (variant === "hero") el.setAttribute("eager", "");
          el.style.width = "100%";
          el.style.height = "100%";
          el.style.display = "block";
          el.style.setProperty("--agent-accent", "#b8ff2e");
          el.style.setProperty("--agent-surface", "rgba(10, 10, 10, 0.92)");
          el.style.setProperty("--agent-on-surface", "#f4f4f5");
          el.addEventListener("agent:error", () => {
            if (!cancelled) setFailed(true);
          });
          el.addEventListener("agent:ready", () => {
            if (!cancelled) setReady(true);
          });
          hostRef.current.appendChild(el);
          agentElRef.current = el;
          window.setTimeout(() => {
            if (!cancelled) setReady(true);
          }, 2500);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });

      return () => {
        cancelled = true;
        if (fxTimer.current) window.clearTimeout(fxTimer.current);
        try {
          agentElRef.current?.destroy?.();
        } catch {
          /* ignore */
        }
        agentElRef.current = null;
      };
    }, [glbUrl, variant]);

    if (failed && fallback) return <>{fallback}</>;

    return (
      <div
        ref={shellRef}
        style={{ "--play-accent": "#b8ff2e" } as CSSProperties}
        className={cn(
          "relative overflow-hidden border border-white/10 bg-[#050505]",
          variant === "hero" ? "rounded-sm" : "rounded-[inherit]",
          className
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_70%,color-mix(in_srgb,var(--play-accent)_14%,transparent),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-1/3 bg-gradient-to-t from-black/50 to-transparent"
        />

        <FxOverlay fx={fx} />

        <div
          className={cn(
            "relative z-[1] h-full w-full origin-center",
            fx === "whale-breach" && "avatar-fx-whale-bob",
            fx === "sonar-ping" && "avatar-fx-sonar-bob",
            animPulse && "avatar-fx-anim-bob"
          )}
        >
          {!ready && !failed && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
              <div className="size-8 animate-pulse rounded-full border border-accent/40 bg-accent/10" />
              <p className="text-[11px] tracking-wide text-muted">Loading 3D agent…</p>
            </div>
          )}
          {failed && !fallback && (
            <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-[12px] text-muted">
              3D preview unavailable
            </div>
          )}
          <div ref={hostRef} className="h-full w-full" aria-label={`${agentName} 3D avatar`} />
        </div>

        {variant === "hero" && (
          <a
            href="https://three.ws"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-2 right-2 z-10 rounded-sm bg-black/55 px-2 py-0.5 text-[10px] text-subtle backdrop-blur-sm transition-colors hover:text-muted"
          >
            3D by three.ws
          </a>
        )}
      </div>
    );
  }
);
