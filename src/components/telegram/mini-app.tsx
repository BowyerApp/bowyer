"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bell, Bot, Gift, MessageSquare } from "lucide-react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        initData?: string;
        initDataUnsafe?: { user?: { first_name?: string } };
      };
    };
  }
}

const actions = [
  { icon: Bot, title: "Explore businesses", body: "Find a trading or research agent that earns its place in your inbox.", href: "/marketplace" },
  { icon: Bell, title: "Daily intelligence", body: "Get a concise report digest in Telegram. Manage it from the bot menu.", href: "/portfolio" },
  { icon: MessageSquare, title: "Chat with your agent", body: "Just send a message in the bot — Robinhood Trading Agent replies directly. Free POC spots available.", href: "/agents/robinhood-trading-agent" },
  { icon: Gift, title: "Grow your network", body: "Invite traders through the bot and be ready for early network rewards.", href: "/portfolio" },
];

export function TelegramMiniApp() {
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "linked" | "unlinked" | "browser">("loading");
  const [agents, setAgents] = useState<{ slug: string; name: string; tagline: string }[]>([]);

  useEffect(() => {
    const app = window.Telegram?.WebApp;
    app?.ready();
    app?.expand();
    app?.setHeaderColor?.("#0a0a0a");
    app?.setBackgroundColor?.("#0a0a0a");
    setName(app?.initDataUnsafe?.user?.first_name ?? null);
    if (!app?.initData) {
      setStatus("browser");
      return;
    }
    void fetch("/api/auth/telegram/webapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: app.initData }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Telegram verification failed");
        return fetch("/api/tma/me");
      })
      .then(async (res) => {
        if (!res.ok) throw new Error("Telegram session failed");
        return res.json() as Promise<{ linked: boolean; follows: { slug: string; name: string; tagline: string }[] }>;
      })
      .then((data) => {
        setAgents(data.follows);
        setStatus(data.linked ? "linked" : "unlinked");
      })
      .catch(() => setStatus("browser"));
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-5 py-6 text-foreground">
      <div className="mx-auto max-w-md">
        <p className="text-xs font-medium tracking-[0.2em] text-[#c8ff00]">BOWYER / COMMAND CENTER</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {name ? `Good to see you, ${name}.` : "Your agent workforce."}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Research, signals, subscriptions, and your Telegram intelligence loop — in one place.
        </p>

        {status === "unlinked" && (
          <Link href="/portfolio" className="mt-5 block rounded-xl border border-[#c8ff00]/30 bg-[#c8ff00]/10 p-4 text-sm text-foreground">
            Connect your wallet on BOWYER to unlock private agent chat and subscriptions. <span className="text-[#c8ff00]">Open Portfolio →</span>
          </Link>
        )}
        {status === "linked" && (
          <div className="mt-5 rounded-xl border border-white/10 bg-[#111] p-4">
            <p className="text-xs font-medium tracking-[0.14em] text-[#c8ff00]">YOUR ACTIVE AGENTS</p>
            <div className="mt-3 space-y-2">
              {agents.map((agent) => (
                <Link key={agent.slug} href={`/agents/${agent.slug}`} className="block rounded-lg bg-white/[0.04] p-3">
                  <span className="block text-sm font-medium">{agent.name}</span>
                  <span className="mt-1 block text-xs text-muted">{agent.tagline}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <Link
          href="/marketplace"
          className="mt-6 flex items-center justify-between rounded-xl bg-[#c8ff00] px-4 py-4 font-semibold text-black"
        >
          Discover an agent <ArrowUpRight size={19} />
        </Link>

        <div className="mt-5 grid gap-3">
          {actions.map(({ icon: Icon, title, body, href }) => (
            <Link key={title} href={href} className="rounded-xl border border-white/10 bg-[#111] p-4 transition-colors active:bg-[#181818]">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-[#c8ff00]/10 p-2 text-[#c8ff00]"><Icon size={18} /></span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">{body}</span>
                </span>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-muted">
          Back in the bot: just send a message to chat. Use <span className="text-foreground">/menu</span> for shortcuts or <span className="text-foreground">/agents</span> to switch agents.
        </p>
      </div>
    </div>
  );
}
