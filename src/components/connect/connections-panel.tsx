"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Github, MessageCircle, Send, Unplug } from "lucide-react";
import { Container } from "@/components/layout/container";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

interface Connection {
  provider: string;
  providerUsername: string | null;
  connectedAt: string;
}

interface Configured {
  github: boolean;
  telegram: boolean;
  notion: boolean;
  discord: boolean;
  x: boolean;
}

declare global {
  interface Window {
    onBowyerTelegramAuth?: (user: Record<string, string>) => void;
  }
}

const OAUTH_ROWS = [
  {
    id: "github",
    label: "GitHub",
    icon: Github,
    blurb: "Browse private repos in Launch and ingest READMEs at runtime.",
    authPath: "/api/auth/github",
  },
  {
    id: "notion",
    label: "Notion",
    icon: BookOpen,
    blurb: "Pick workspace pages as live knowledge sources.",
    authPath: "/api/auth/notion",
  },
  {
    id: "discord",
    label: "Discord",
    icon: MessageCircle,
    blurb: "Ingest recent messages from channels the bot can access.",
    authPath: "/api/auth/discord",
  },
  {
    id: "x",
    label: "X",
    icon: MessageCircle,
    blurb: "Ground reports in your recent posts.",
    authPath: "/api/auth/x",
  },
] as const;

export function ConnectionsPanel() {
  const { address, authenticate } = useWallet();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [configured, setConfigured] = useState<Configured | null>(null);
  const [loading, setLoading] = useState(true);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    if (!(await authenticate())) {
      setLoading(false);
      return;
    }
    fetch(`/api/auth/connections?wallet=${address}`)
      .then((r) => r.json())
      .then((d) => {
        setConnections(d.connections ?? []);
        setConfigured(d.configured ?? null);
      })
      .catch(() => {
        setConnections([]);
        setConfigured(null);
      })
      .finally(() => setLoading(false));
  }, [address, authenticate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!address) return;
    window.onBowyerTelegramAuth = async (user) => {
      setTelegramBusy(true);
      try {
        if (!(await authenticate())) return;
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...user, wallet: address }),
        });
        if (res.ok) refresh();
      } finally {
        setTelegramBusy(false);
      }
    };
    return () => {
      delete window.onBowyerTelegramAuth;
    };
  }, [address, authenticate, refresh]);

  async function disconnect(provider: string) {
    if (!address) return;
    if (!(await authenticate())) return;
    await fetch("/api/auth/connections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: address, provider }),
    });
    refresh();
  }

  async function beginOAuth(event: React.MouseEvent<HTMLAnchorElement>, authPath: string) {
    event.preventDefault();
    if (!address || !(await authenticate())) return;
    window.location.assign(`${authPath}?wallet=${address}&returnTo=/portfolio`);
  }

  function connectionFor(provider: string) {
    return connections.find((c) => c.provider === provider);
  }

  if (loading) {
    return (
      <Container className="pt-10 pb-24">
        <div className="h-32 animate-pulse rounded-sm bg-white/[0.03]" />
      </Container>
    );
  }

  return (
    <Container className="step-enter pt-10 pb-24">
      <h2 className="section-heading">Connections</h2>
      <p className="mt-1.5 max-w-xl text-[13px] text-muted">
        Link accounts once. Use them in Launch for knowledge sources, or Telegram for report
        delivery.
      </p>

      <div className="mt-10 grid max-w-2xl gap-px overflow-hidden rounded-sm border border-border bg-border">
        {OAUTH_ROWS.map(({ id, label, icon: Icon, blurb, authPath }) => {
          const conn = connectionFor(id);
          const isConfigured = configured?.[id as keyof Configured];
          return (
            <div
              key={id}
              className="flex flex-col gap-4 bg-background p-7 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-4">
                <Icon className="mt-0.5 size-5 text-foreground" strokeWidth={1.5} />
                <div>
                  <p className="text-[15px] font-medium text-foreground">{label}</p>
                  <p className="mt-1 text-[13px] text-muted">
                    {conn?.providerUsername
                      ? `@${conn.providerUsername}`
                      : conn
                        ? "Connected"
                        : blurb}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {conn ? (
                  <button
                    type="button"
                    onClick={() => disconnect(id)}
                    className="flex h-9 items-center gap-1.5 rounded-sm border border-border px-4 text-[13px] text-muted hover:text-foreground"
                  >
                    <Unplug className="size-3.5" /> Disconnect
                  </button>
                ) : isConfigured ? (
                  <a
                    href={`${authPath}?wallet=${address}&returnTo=/portfolio`}
                    onClick={(event) => beginOAuth(event, authPath)}
                    className="flex h-9 items-center rounded-sm bg-accent px-4 text-[13px] font-medium text-background hover:opacity-90"
                  >
                    Connect {label}
                  </a>
                ) : (
                  <span className="text-[12px] text-subtle">Not configured on server</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Telegram Login Widget */}
        <div className="flex flex-col gap-4 bg-background p-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Send className="mt-0.5 size-5 text-foreground" strokeWidth={1.5} />
            <div>
              <p className="text-[15px] font-medium text-foreground">Telegram</p>
              <p className="mt-1 text-[13px] text-muted">
                {connectionFor("telegram")?.providerUsername
                  ? `@${connectionFor("telegram")?.providerUsername} — use /follow slug in the bot`
                  : "One-click login to link report delivery to this wallet."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2">
            {connectionFor("telegram") ? (
              <button
                type="button"
                onClick={() => disconnect("telegram")}
                className="flex h-9 items-center gap-1.5 rounded-sm border border-border px-4 text-[13px] text-muted hover:text-foreground"
              >
                <Unplug className="size-3.5" /> Disconnect
              </button>
            ) : configured?.telegram && botUsername ? (
              <div
                id="bowyer-telegram-login"
                className={cn(telegramBusy && "pointer-events-none opacity-50")}
                ref={(el) => {
                  if (!el || el.querySelector("script") || connectionFor("telegram")) return;
                  const script = document.createElement("script");
                  script.async = true;
                  script.src = "https://telegram.org/js/telegram-widget.js?22";
                  script.setAttribute("data-telegram-login", botUsername);
                  script.setAttribute("data-size", "medium");
                  script.setAttribute("data-radius", "4");
                  script.setAttribute("data-onauth", "onBowyerTelegramAuth(user)");
                  script.setAttribute("data-request-access", "write");
                  el.appendChild(script);
                }}
              />
            ) : (
              <span className="text-[12px] text-subtle">Set TELEGRAM_BOT_TOKEN + bot username</span>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}
