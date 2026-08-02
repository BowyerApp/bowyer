"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Github,
  MessageCircle,
  Send,
  Twitter,
  Unplug,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import { useWallet, shortAddress } from "@/lib/wallet-context";

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

const RETURN_TO = "/terminal/connections";

const OAUTH_ROWS = [
  {
    id: "x",
    label: "X / Twitter",
    icon: Twitter,
    blurb: "Let agents ground their reports in your feed and the accounts you track.",
    authPath: "/api/auth/x",
  },
  {
    id: "discord",
    label: "Discord",
    icon: MessageCircle,
    blurb: "Let agents ingest recent messages from channels your server allows.",
    authPath: "/api/auth/discord",
  },
  {
    id: "github",
    label: "GitHub",
    icon: Github,
    blurb: "Browse private repos in Builder and ingest READMEs at runtime.",
    authPath: "/api/auth/github",
  },
  {
    id: "notion",
    label: "Notion",
    icon: BookOpen,
    blurb: "Pick workspace pages as live knowledge sources for your agents.",
    authPath: "/api/auth/notion",
  },
] as const;

function Row({
  icon,
  title,
  sub,
  right,
  highlight,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  sub: React.ReactNode;
  right: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`card-frame flex flex-col gap-4 rounded-lg p-5 sm:flex-row sm:items-center sm:justify-between ${
        highlight ? "border-accent/30" : ""
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-raised text-foreground">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
            {title}
          </div>
          <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-muted">{sub}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </div>
  );
}

function ConnectedBadge() {
  return (
    <span className="rounded border border-[#2dd4a7]/40 bg-[#2dd4a7]/10 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-up">
      Connected
    </span>
  );
}

export function ConnectionsView() {
  const { address, connect, disconnect: walletDisconnect, authenticate } = useWallet();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [configured, setConfigured] = useState<Configured | null>(null);
  const [loading, setLoading] = useState(false);
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

  async function disconnectProvider(provider: string) {
    if (!address || !(await authenticate())) return;
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
    window.location.assign(`${authPath}?wallet=${address}&returnTo=${RETURN_TO}`);
  }

  const connectionFor = (provider: string) => connections.find((c) => c.provider === provider);

  const disconnectBtn = (provider: string) => (
    <button
      type="button"
      onClick={() => disconnectProvider(provider)}
      className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-muted transition-colors hover:text-foreground"
    >
      <Unplug size={12} /> Disconnect
    </button>
  );

  const connectBtn = (label: string, authPath: string) => (
    <a
      href={`${authPath}?wallet=${address}&returnTo=${RETURN_TO}`}
      onClick={(e) => beginOAuth(e, authPath)}
      className="flex h-8 items-center rounded-md bg-accent px-3.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
    >
      Connect
    </a>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-[19px] font-bold tracking-tight text-foreground">Connections</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        Link your accounts so agents can read your sources and reach you anywhere.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {/* Trading wallet */}
        <Row
          highlight={Boolean(address)}
          icon={<Wallet size={16} strokeWidth={1.8} />}
          title={
            <>
              Trading Wallet {address && <ConnectedBadge />}
            </>
          }
          sub={
            address ? (
              <span className="font-mono-num text-accent">{shortAddress(address)}</span>
            ) : (
              "The wallet agents act for — subscriptions, x402 calls and referrals all key off it."
            )
          }
          right={
            address ? (
              <button
                type="button"
                onClick={() => walletDisconnect()}
                className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-muted transition-colors hover:text-foreground"
              >
                <Unplug size={12} /> Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={() => connect()}
                className="flex h-8 items-center rounded-md bg-accent px-3.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
              >
                Connect
              </button>
            )
          }
        />

        {!address && (
          <div className="card-frame rounded-lg p-4 text-[12px] text-muted">
            Connect your wallet first — every other connection is scoped to it.
          </div>
        )}

        {address && (
          <>
            {/* Telegram — login widget */}
            <Row
              highlight={Boolean(connectionFor("telegram"))}
              icon={<Send size={16} strokeWidth={1.8} />}
              title={
                <>
                  Telegram {connectionFor("telegram") && <ConnectedBadge />}
                </>
              }
              sub={
                connectionFor("telegram")?.providerUsername
                  ? `@${connectionFor("telegram")?.providerUsername} — reports and alerts land in your DMs. Drive agents with /commands.`
                  : "Get reports, fills and risk alerts in your DMs. Control agents with /commands."
              }
              right={
                connectionFor("telegram") ? (
                  disconnectBtn("telegram")
                ) : configured?.telegram && botUsername ? (
                  <div
                    className={telegramBusy ? "pointer-events-none opacity-50" : ""}
                    ref={(el) => {
                      if (!el || el.querySelector("script")) return;
                      const script = document.createElement("script");
                      script.async = true;
                      script.src = "https://telegram.org/js/telegram-widget.js?22";
                      script.setAttribute("data-telegram-login", botUsername);
                      script.setAttribute("data-size", "medium");
                      script.setAttribute("data-radius", "6");
                      script.setAttribute("data-onauth", "onBowyerTelegramAuth(user)");
                      script.setAttribute("data-request-access", "write");
                      el.appendChild(script);
                    }}
                  />
                ) : (
                  <span className="text-[11px] text-subtle">Not configured on server</span>
                )
              }
            />

            {/* OAuth providers */}
            {OAUTH_ROWS.map(({ id, label, icon: Icon, blurb, authPath }) => {
              const conn = connectionFor(id);
              const isConfigured = configured?.[id as keyof Configured];
              return (
                <Row
                  key={id}
                  highlight={Boolean(conn)}
                  icon={<Icon size={16} strokeWidth={1.8} />}
                  title={
                    <>
                      {label} {conn && <ConnectedBadge />}
                    </>
                  }
                  sub={conn?.providerUsername ? `@${conn.providerUsername}` : conn ? "Connected" : blurb}
                  right={
                    conn ? (
                      disconnectBtn(id)
                    ) : isConfigured ? (
                      connectBtn(label, authPath)
                    ) : (
                      <span className="text-[11px] text-subtle">Not configured on server</span>
                    )
                  }
                />
              );
            })}

            {/* Robinhood trading console */}
            <Row
              icon={
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/images/agents/robinhood-trading-agent.png"
                  alt=""
                  className="size-9 rounded-md object-cover"
                />
              }
              title="Robinhood Agentic Account"
              sub="Connect via Robinhood's official Trading MCP. Configure hard limits and approvals in the trading console."
              right={
                <Link
                  href="/agents/robinhood-trading-agent#trading"
                  className="flex h-8 items-center gap-1 rounded-md border border-border bg-raised px-3.5 text-[12px] text-foreground transition-colors hover:border-accent/40"
                >
                  Open console <ArrowUpRight size={12} />
                </Link>
              }
            />
          </>
        )}
      </div>

      {loading && <div className="mt-4 text-[11.5px] text-subtle">Refreshing connections…</div>}

      <p className="mt-6 rounded-lg border border-border bg-raised/40 p-4 text-[11.5px] leading-relaxed text-subtle">
        Connections are scoped to your wallet. You can revoke any integration at any time — agents
        lose access instantly and nothing happens without your signed session.
      </p>
    </div>
  );
}
