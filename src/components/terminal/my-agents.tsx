"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Bot, Store } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { timeAgo } from "@/components/terminal/widgets";

export interface AgentCard {
  slug: string;
  name: string;
  tagline: string;
  categoryLabel: string;
  art: string;
  priceUsd: number;
}

interface Sub {
  slug: string;
  at: string;
  amountUsd: number;
}

export function MyAgentsView({ agents }: { agents: AgentCard[] }) {
  const { address, connect, authenticate } = useWallet();
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const load = useCallback(async () => {
    if (!address) return;
    setState("loading");
    if (!(await authenticate())) {
      setState("error");
      return;
    }
    try {
      const res = await fetch(`/api/subscriptions?subscriber=${address}`);
      const data = await res.json();
      setSubs(
        (data.subscriptions ?? []).map((s: { slug: string; at: string; amountUsd?: number }) => ({
          slug: s.slug,
          at: s.at,
          amountUsd: s.amountUsd ?? 0,
        }))
      );
      setState("ready");
    } catch {
      setState("error");
    }
  }, [address, authenticate]);

  useEffect(() => {
    load();
  }, [load]);

  const bySlug = new Map(agents.map((a) => [a.slug, a]));
  const mine = (subs ?? [])
    .map((s) => ({ sub: s, agent: bySlug.get(s.slug) }))
    .filter((x) => x.agent) as { sub: Sub; agent: AgentCard }[];
  const mineSlugs = new Set(mine.map((m) => m.agent.slug));
  const rest = agents.filter((a) => !mineSlugs.has(a.slug));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight text-foreground">My agents</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            The businesses this wallet runs — live subscriptions, straight from the chain ledger.
          </p>
        </div>
        <Link
          href="/marketplace"
          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-raised px-3 text-[12px] text-foreground transition-colors hover:border-accent/40"
        >
          <Store size={13} /> Marketplace
        </Link>
      </div>

      {!address ? (
        <div className="card-frame mt-6 flex flex-col items-center gap-3 rounded-lg p-10 text-center">
          <Bot size={22} className="text-subtle" />
          <p className="text-[13px] text-muted">Connect your wallet to see the agents you run.</p>
          <button
            type="button"
            onClick={() => connect()}
            className="mt-1 rounded-md bg-accent px-4 py-2 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Connect Wallet
          </button>
        </div>
      ) : state === "loading" || state === "idle" ? (
        <div className="card-frame mt-6 rounded-lg p-10 text-center text-[12.5px] text-muted">
          Reading your subscriptions…
        </div>
      ) : state === "error" ? (
        <div className="card-frame mt-6 rounded-lg p-10 text-center text-[12.5px] text-muted">
          Sign the session request to load your agents.{" "}
          <button type="button" onClick={load} className="text-accent underline-offset-2 hover:underline">
            Retry
          </button>
        </div>
      ) : mine.length === 0 ? (
        <div className="card-frame mt-6 flex flex-col items-center gap-2 rounded-lg p-10 text-center">
          <p className="text-[13.5px] font-medium text-foreground">No agents on payroll yet</p>
          <p className="max-w-md text-[12.5px] text-muted">
            Subscribe to any business in the marketplace and it shows up here with its reports and
            tools.
          </p>
          <Link
            href="/marketplace"
            className="mt-2 rounded-md bg-accent px-4 py-2 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Browse businesses
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {mine.map(({ sub, agent }) => (
            <Link
              key={agent.slug}
              href={`/agents/${agent.slug}`}
              className="card-frame group flex gap-4 rounded-lg p-4 transition-colors hover:border-accent/40"
            >
              <Image
                src={agent.art}
                alt=""
                width={72}
                height={72}
                className="size-[72px] shrink-0 rounded-md border border-border object-cover"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-foreground">
                    {agent.name}
                  </span>
                  <span className="rounded border border-[#2dd4a7]/40 bg-[#2dd4a7]/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-up">
                    Active
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                  {agent.tagline}
                </p>
                <p className="mt-1.5 font-mono-num text-[10.5px] text-subtle">
                  {agent.categoryLabel} · subscribed {timeAgo(sub.at)} ago
                </p>
              </div>
              <ArrowUpRight
                size={14}
                className="ml-auto shrink-0 text-subtle transition-colors group-hover:text-accent"
              />
            </Link>
          ))}
        </div>
      )}

      {address && state === "ready" && rest.length > 0 && (
        <>
          <h2 className="mt-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
            Available to hire
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((agent) => (
              <Link
                key={agent.slug}
                href={`/agents/${agent.slug}`}
                className="card-frame group flex items-center gap-3 rounded-lg p-3 transition-colors hover:border-accent/40"
              >
                <Image
                  src={agent.art}
                  alt=""
                  width={44}
                  height={44}
                  className="size-11 shrink-0 rounded-md border border-border object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-foreground">{agent.name}</p>
                  <p className="font-mono-num text-[10.5px] text-subtle">
                    {agent.categoryLabel}
                    {agent.priceUsd > 0
                      ? ` · $${agent.priceUsd}/mo`
                      : /free|premium/i.test(agent.categoryLabel)
                        ? ""
                        : " · Free"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
