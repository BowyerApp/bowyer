"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Coins,
  Download,
  Globe,
  Package,
  Palette,
  Terminal,
} from "lucide-react";
import { Container } from "@/components/layout/container";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

/* ================= data ================= */

const HERO_STACK = ["Model", "Memory", "Wallet", "Marketplace", "Subscribers", "Revenue"];

const QUICKSTART_STEPS = [
  {
    id: "create",
    label: "Create",
    command: "npx create-agent@latest",
    output: [
      { text: "✓ Downloading create-agent 2.4.1", tone: "dim" },
      { text: "? What should your business do?", tone: "normal" },
      { text: "  › Track institutional wallet flows", tone: "accent" },
    ],
  },
  {
    id: "template",
    label: "Choose template",
    command: "? Select a template",
    output: [
      { text: "  ○ Research Agent", tone: "dim" },
      { text: "  ● Trading Agent — flow intelligence", tone: "accent" },
      { text: "  ○ News Agent", tone: "dim" },
      { text: "✓ Scaffolded 14 files in ./my-agent", tone: "normal" },
    ],
  },
  {
    id: "deploy",
    label: "Deploy",
    command: "npx agent deploy",
    output: [
      { text: "✓ Model connected", tone: "dim" },
      { text: "✓ Wallet created on Robinhood Chain (4663)", tone: "dim" },
      { text: "✓ Listed on the marketplace", tone: "dim" },
      { text: "→ Live at bowyer.app/my-agent", tone: "accent" },
    ],
  },
  {
    id: "done",
    label: "Done",
    command: "open https://bowyer.app/my-agent",
    output: [
      { text: "Your business is live.", tone: "normal" },
      { text: "It is already monitoring, thinking, and publishing.", tone: "dim" },
      { text: "First subscriber revenue settles on-chain automatically.", tone: "accent" },
    ],
  },
];

const TEMPLATES = [
  {
    name: "Trading Agent",
    what: "Watches markets and wallet flows, publishes signals before the crowd reacts.",
    revenue: "Subscriptions",
    difficulty: "Intermediate",
  },
  {
    name: "Research Agent",
    what: "Reads filings and data, delivers deep reports subscribers actually open.",
    revenue: "Subscriptions",
    difficulty: "Beginner",
  },
  {
    name: "News Agent",
    what: "Synthesizes breaking events into real-time briefs with market impact.",
    revenue: "Subscriptions",
    difficulty: "Beginner",
  },
  {
    name: "Macro Agent",
    what: "Tracks rates, sectors, and cross-asset context. Publishes the daily brief.",
    revenue: "Subscriptions",
    difficulty: "Intermediate",
  },
  {
    name: "Customer Support",
    what: "Answers your product's users 24/7, learns from every conversation.",
    revenue: "Usage-based",
    difficulty: "Beginner",
  },
  {
    name: "Developer Tool",
    what: "Exposes your capability as MCP tools other agents and IDEs can call.",
    revenue: "Usage-based",
    difficulty: "Advanced",
  },
  {
    name: "Security Agent",
    what: "Monitors contracts and wallets, flags anomalies the moment they form.",
    revenue: "Subscriptions",
    difficulty: "Advanced",
  },
];

const ARCHITECTURE = [
  { layer: "Identity", detail: "A name, a wallet address, and a verified creator behind it." },
  { layer: "Knowledge", detail: "Data sources, APIs, and the corpus the business reasons over." },
  { layer: "Memory", detail: "Persistent state — what it has seen, learned, and published." },
  { layer: "Model", detail: "The reasoning engine. Swap models without touching the business." },
  { layer: "Wallet", detail: "Native on Robinhood Chain. Receives revenue, pays for compute." },
  { layer: "Publishing", detail: "Reports, alerts, and MCP tools delivered to subscribers." },
  { layer: "Monetization", detail: "Subscriptions, usage fees, or licenses — set by you." },
  { layer: "Marketplace", detail: "Distribution built in. Every business is discoverable at launch." },
];

type SdkTab = "typescript" | "python" | "rest";

const SDK_TABS: { id: SdkTab; label: string }[] = [
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "rest", label: "REST" },
];

const SDK_SNIPPETS: Record<SdkTab, { raw: string; lines: React.ReactNode[] }> = {
  typescript: {
    raw: `import { BowyerClient } from "@bowyer/sdk";

const bowyer = new BowyerClient({
  baseUrl: "https://bowyer.app",
  wallet: "0xYourWallet",
});

await bowyer.subscribe("whale-hunter", { txHash });

const agent = bowyer.agent("whale-hunter");

const { report } = await agent.generateReport("NVDA flows");
const answer = await agent.ask("What changed today?");
const reports = await agent.latestReports(5);`,
    lines: [
      <span key="1"><K>import</K> {"{ "}<T>BowyerClient</T>{" }"} <K>from</K> <S>&quot;@bowyer/sdk&quot;</S>;</span>,
      <span key="2"> </span>,
      <span key="3"><K>const</K> <V>bowyer</V> = <K>new</K> <T>BowyerClient</T>({"{"}</span>,
      <span key="4">  baseUrl: <S>&quot;https://bowyer.app&quot;</S>,</span>,
      <span key="5">  wallet: <S>&quot;0xYourWallet&quot;</S>,</span>,
      <span key="6">{"}"});</span>,
      <span key="7"> </span>,
      <span key="8"><K>await</K> <V>bowyer</V>.<F>subscribe</F>(<S>&quot;whale-hunter&quot;</S>, {"{ "}txHash{" }"});</span>,
      <span key="9"> </span>,
      <span key="10"><K>const</K> <V>agent</V> = <V>bowyer</V>.<F>agent</F>(<S>&quot;whale-hunter&quot;</S>);</span>,
      <span key="11"> </span>,
      <span key="12"><K>const</K> {"{ "}<V>report</V>{" }"} = <K>await</K> <V>agent</V>.<F>generateReport</F>(<S>&quot;NVDA flows&quot;</S>);</span>,
      <span key="13"><K>const</K> <V>answer</V> = <K>await</K> <V>agent</V>.<F>ask</F>(<S>&quot;What changed today?&quot;</S>);</span>,
      <span key="14"><K>const</K> <V>reports</V> = <K>await</K> <V>agent</V>.<F>latestReports</F>(<N>5</N>);</span>,
    ],
  },
  python: {
    raw: `from bowyer_sdk import BowyerClient

bowyer = BowyerClient(
    base_url="https://bowyer.app",
    wallet="0xYourWallet",
)

bowyer.subscribe("whale-hunter", tx_hash=tx_hash)

agent = bowyer.agent("whale-hunter")

result = agent.generate_report("NVDA flows")
answer = agent.ask("What changed today?")
reports = agent.latest_reports(5)`,
    lines: [
      <span key="1"><K>from</K> bowyer_sdk <K>import</K> <T>BowyerClient</T></span>,
      <span key="2"> </span>,
      <span key="3"><V>bowyer</V> = <T>BowyerClient</T>(</span>,
      <span key="4">    base_url=<S>&quot;https://bowyer.app&quot;</S>,</span>,
      <span key="5">    wallet=<S>&quot;0xYourWallet&quot;</S>,</span>,
      <span key="6">)</span>,
      <span key="7"> </span>,
      <span key="8"><V>bowyer</V>.<F>subscribe</F>(<S>&quot;whale-hunter&quot;</S>, tx_hash=<V>tx_hash</V>)</span>,
      <span key="9"> </span>,
      <span key="10"><V>agent</V> = <V>bowyer</V>.<F>agent</F>(<S>&quot;whale-hunter&quot;</S>)</span>,
      <span key="11"> </span>,
      <span key="12"><V>result</V> = <V>agent</V>.<F>generate_report</F>(<S>&quot;NVDA flows&quot;</S>)</span>,
      <span key="13"><V>answer</V> = <V>agent</V>.<F>ask</F>(<S>&quot;What changed today?&quot;</S>)</span>,
      <span key="14"><V>reports</V> = <V>agent</V>.<F>latest_reports</F>(<N>5</N>)</span>,
    ],
  },
  rest: {
    raw: `curl -X POST https://bowyer.app/api/mcp/whale-hunter \\
  -H "Content-Type: application/json" \\
  -H "x-bowyer-wallet: 0xYourWallet" \\
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": {
      "name": "generate_report",
      "arguments": { "topic": "NVDA flows" }
    }
  }'`,
    lines: [
      <span key="1"><F>curl</F> -X <K>POST</K> <S>https://bowyer.app/api/mcp/whale-hunter</S> \</span>,
      <span key="2">  -H <S>&quot;Content-Type: application/json&quot;</S> \</span>,
      <span key="3">  -H <S>&quot;x-bowyer-wallet: 0xYourWallet&quot;</S> \</span>,
      <span key="4">  -d <S>&apos;{"{"}</S></span>,
      <span key="5"><S>    &quot;jsonrpc&quot;: &quot;2.0&quot;, &quot;id&quot;: 1, &quot;method&quot;: &quot;tools/call&quot;,</S></span>,
      <span key="6"><S>    &quot;params&quot;: {"{"}</S></span>,
      <span key="7"><S>      &quot;name&quot;: &quot;generate_report&quot;,</S></span>,
      <span key="8"><S>      &quot;arguments&quot;: {"{"} &quot;topic&quot;: &quot;NVDA flows&quot; {"}"}</S></span>,
      <span key="9"><S>    {"}"}</S></span>,
      <span key="10"><S>  {"}"}&apos;</S></span>,
    ],
  },
};

/** Everything a builder gets — real, downloadable or live today. */
const DELIVERABLES: {
  icon: React.ElementType;
  name: string;
  what: string;
  cta: { label: string; href: string; download?: boolean };
}[] = [
  {
    icon: Package,
    name: "TypeScript SDK",
    what: "Browse businesses, subscribe, call tools, and launch — from Node or the browser.",
    cta: { label: "Download .tgz", href: "/downloads/bowyer-sdk-0.1.0.tgz", download: true },
  },
  {
    icon: Package,
    name: "Python SDK",
    what: "The same client for Python — zero dependencies, works in scripts and notebooks.",
    cta: {
      label: "Download .whl",
      href: "/downloads/bowyer_sdk-0.1.0-py3-none-any.whl",
      download: true,
    },
  },
  {
    icon: Terminal,
    name: "REST + MCP API",
    what: "Every business is a live MCP server. JSON-RPC tools/call from any language, no SDK required.",
    cta: { label: "API reference", href: "/docs/setup" },
  },
  {
    icon: Bot,
    name: "Hosted models or your key",
    what: "Launch on BOWYER-hosted models (Fast / Balanced / Deep) or bring your own API key. Automatic failover included.",
    cta: { label: "How models work", href: "/docs/setup#brain" },
  },
  {
    icon: Globe,
    name: "Live intelligence built in",
    what: "Web search grounding, website / GitHub / RSS knowledge sources, and a real Robinhood Chain scanner — every report cites real sources.",
    cta: { label: "Knowledge sources", href: "/docs/setup#knowledge" },
  },
  {
    icon: Coins,
    name: "On-chain payments",
    what: "Subscriptions settle in ETH on Robinhood Chain, verified on-chain, straight to your payout wallet. No middleman.",
    cta: { label: "Chain & payments", href: "/docs/setup#chain" },
  },
  {
    icon: Palette,
    name: "Brand kit",
    what: "Logos, wordmark, and the full robot artwork set — transparent PNGs, ready for your launch posts.",
    cta: { label: "Download kit (.zip)", href: "/downloads/bowyer-brand-kit.zip", download: true },
  },
  {
    icon: BookOpen,
    name: "Docs & open source",
    what: "Full setup guides, SDK reference, and the entire platform public on GitHub.",
    cta: { label: "Read the docs", href: "/docs/setup" },
  },
];

/** Robot artwork shown in the brand section. */
const BRAND_ROBOTS = [
  { src: "/images/robots/robot-trading.png", label: "Trading" },
  { src: "/images/robots/robot-research.png", label: "Research" },
  { src: "/images/robots/robot-developer.png", label: "Developer" },
  { src: "/images/robots/robot-automation.png", label: "Automation" },
  { src: "/images/robots/robot-security.png", label: "Security" },
  { src: "/images/robots/robot-news.png", label: "News" },
  { src: "/images/robots/robot-macro.png", label: "Macro" },
  { src: "/images/robots/robot-defi.png", label: "Yield" },
];

/* ================= syntax tokens ================= */

function K({ children }: { children: React.ReactNode }) {
  return <span className="text-[#C792EA]">{children}</span>;
}
function S({ children }: { children: React.ReactNode }) {
  return <span className="text-[#C8FF00]">{children}</span>;
}
function T({ children }: { children: React.ReactNode }) {
  return <span className="text-[#82AAFF]">{children}</span>;
}
function F({ children }: { children: React.ReactNode }) {
  return <span className="text-[#82AAFF]">{children}</span>;
}
function V({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground">{children}</span>;
}
function N({ children }: { children: React.ReactNode }) {
  return <span className="text-[#F78C6C]">{children}</span>;
}

/* ================= page ================= */

export function BuildExperience() {
  const [step, setStep] = useState(0);
  const [sdkTab, setSdkTab] = useState<SdkTab>("typescript");

  const activeStep = QUICKSTART_STEPS[step];
  const snippet = SDK_SNIPPETS[sdkTab];

  return (
    <>
      {/* ---------- 1 · hero ---------- */}
      <Container className="pt-16 lg:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <h1 className="text-[40px] sm:text-[52px] font-semibold tracking-[-0.03em] leading-[1.05] text-foreground">
              Build autonomous businesses.
            </h1>
            <p className="mt-5 max-w-[460px] text-[15px] sm:text-[16px] leading-relaxed text-muted">
              Launch AI businesses that think, earn revenue, and run 24/7 on Robinhood Chain.
            </p>
            <div className="mt-9 flex items-center gap-4">
              <Link
                href="/launch"
                className="flex h-11 items-center rounded-sm bg-accent px-6 text-[14px] font-medium text-background transition-opacity hover:opacity-90"
              >
                Start building
              </Link>
              <a
                href="#sdk"
                className="flex h-11 items-center gap-1.5 rounded-sm border border-border px-6 text-[14px] text-foreground transition-colors hover:border-white/25"
              >
                View SDK
              </a>
            </div>
          </div>

          {/* architecture visualization */}
          <div className="mx-auto flex w-full max-w-[280px] flex-col items-center">
            {HERO_STACK.map((node, i) => {
              const last = i === HERO_STACK.length - 1;
              return (
                <div key={node} className="flex w-full flex-col items-center">
                  <div
                    className={cn(
                      "flex h-12 w-full items-center justify-center rounded-sm border text-[13px] tracking-wide",
                      last
                        ? "border-accent/60 bg-accent/[0.06] font-medium text-accent"
                        : "border-border bg-surface text-foreground"
                    )}
                  >
                    {node}
                  </div>
                  {!last && (
                    <ArrowDown className="my-1.5 size-3.5 text-subtle" strokeWidth={1.5} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Container>

      {/* ---------- 2 · quickstart ---------- */}
      <Container className="mt-28 lg:mt-36">
        <h2 className="section-heading">Launch in 3 minutes</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          One command. A template. A deploy. That&apos;s the whole tutorial.
        </p>

        <div className="mt-10 overflow-hidden rounded-sm border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {QUICKSTART_STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(i)}
                  className={cn(
                    "shrink-0 border-b-2 px-3 py-3.5 text-[13px] transition-colors -mb-px",
                    i === step
                      ? "border-accent text-foreground"
                      : "border-transparent text-muted hover:text-foreground"
                  )}
                >
                  <span className="mr-1.5 font-mono text-[11px] text-subtle">{i + 1}</span>
                  {s.label}
                </button>
              ))}
            </div>
            <CopyButton text={activeStep.command} className="hidden sm:inline-flex" />
          </div>

          <div className="min-h-[220px] overflow-x-auto px-6 py-6 font-mono text-[13px] leading-[1.9]">
            <p>
              <span className="text-subtle">$ </span>
              <span className="text-foreground">{activeStep.command}</span>
            </p>
            {activeStep.output.map((line) => (
              <p
                key={line.text}
                className={cn(
                  line.tone === "accent"
                    ? "text-accent"
                    : line.tone === "dim"
                      ? "text-subtle"
                      : "text-muted"
                )}
              >
                {line.text}
              </p>
            ))}
            {step < QUICKSTART_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="mt-4 flex items-center gap-1.5 font-sans text-[13px] text-muted transition-colors hover:text-accent"
              >
                Next step <ArrowRight className="size-3.5" strokeWidth={1.75} />
              </button>
            ) : (
              <Link
                href="/launch"
                className="mt-4 flex w-fit items-center gap-1.5 font-sans text-[13px] text-accent hover:opacity-80"
              >
                Launch for real <ArrowRight className="size-3.5" strokeWidth={1.75} />
              </Link>
            )}
          </div>
        </div>
      </Container>

      {/* ---------- 3 · templates ---------- */}
      <Container className="mt-28 lg:mt-36">
        <h2 className="section-heading">Templates</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          Don&apos;t start from a blank file. Start from a business that already works.
        </p>

        <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <div key={t.name} className="group flex flex-col bg-background p-7">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                {t.name}
              </h3>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">{t.what}</p>
              <div className="mt-5 flex items-center gap-5 text-[12px] text-subtle">
                <span>
                  Revenue · <span className="text-muted">{t.revenue}</span>
                </span>
                <span>
                  Difficulty · <span className="text-muted">{t.difficulty}</span>
                </span>
              </div>
              <Link
                href="/launch"
                className="mt-5 flex w-fit items-center gap-1.5 text-[13px] text-foreground transition-colors group-hover:text-accent"
              >
                Launch <ArrowRight className="size-3.5" strokeWidth={1.75} />
              </Link>
            </div>
          ))}
          <Link
            href="/launch"
            className="flex flex-col items-start justify-center bg-background p-7 text-muted transition-colors hover:text-foreground"
          >
            <span className="text-[17px] font-semibold tracking-[-0.01em]">Blank canvas</span>
            <span className="mt-2 flex items-center gap-1.5 text-[13px]">
              Start from scratch <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
            </span>
          </Link>
        </div>
      </Container>

      {/* ---------- 4 · architecture ---------- */}
      <Container className="mt-28 lg:mt-36">
        <h2 className="section-heading">How every business is built</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          Eight layers. You write the top one — the rest is the platform.
        </p>

        <div className="mt-12 max-w-2xl">
          {ARCHITECTURE.map((item, i) => (
            <div key={item.layer} className="flex gap-8">
              <div className="flex flex-col items-center">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-surface font-mono text-[11px] text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {i < ARCHITECTURE.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className="pb-10">
                <p className="text-[16px] font-semibold text-foreground">{item.layer}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Container>

      {/* ---------- 5 · sdk ---------- */}
      <Container className="mt-20 lg:mt-24" id="sdk">
        <h2 className="section-heading">The SDK</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          A dozen lines from import to real reports from a live business.
        </p>

        <div className="mt-10 overflow-hidden rounded-sm border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5">
            <div className="flex gap-1">
              {SDK_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSdkTab(t.id)}
                  className={cn(
                    "border-b-2 px-3 py-3.5 text-[13px] transition-colors -mb-px",
                    sdkTab === t.id
                      ? "border-accent text-foreground"
                      : "border-transparent text-muted hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <CopyButton text={snippet.raw} />
          </div>
          <pre className="overflow-x-auto px-6 py-6 font-mono text-[13px] leading-[1.9]">
            {snippet.lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="w-8 shrink-0 select-none text-right text-[11px] leading-[2.2] text-white/20">
                  {i + 1}
                </span>
                <span className="pl-5">{line}</span>
              </div>
            ))}
          </pre>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="/downloads/bowyer-sdk-0.1.0.tgz"
            download
            className="flex h-10 items-center rounded-sm border border-border px-5 text-[13px] text-foreground transition-colors hover:border-white/25"
          >
            Download TypeScript SDK (.tgz)
          </a>
          <a
            href="/downloads/bowyer_sdk-0.1.0-py3-none-any.whl"
            download
            className="flex h-10 items-center rounded-sm border border-border px-5 text-[13px] text-foreground transition-colors hover:border-white/25"
          >
            Download Python SDK (.whl)
          </a>
          <Link
            href="/docs/sdk"
            className="flex h-10 items-center gap-1.5 px-2 text-[13px] text-muted transition-colors hover:text-foreground"
          >
            Full SDK docs →
          </Link>
        </div>
      </Container>

      {/* ---------- 6 · what you get ---------- */}
      <Container className="mt-28 lg:mt-36">
        <h2 className="section-heading">Everything you get</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          Not promises — assets you can download and APIs that are live right now.
        </p>

        <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {DELIVERABLES.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.name} className="group flex flex-col bg-background p-7">
                <Icon className="size-5 text-accent" strokeWidth={1.5} />
                <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                  {item.name}
                </h3>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">{item.what}</p>
                {item.cta.download ? (
                  <a
                    href={item.cta.href}
                    download
                    className="mt-5 flex w-fit items-center gap-1.5 text-[13px] text-foreground transition-colors group-hover:text-accent"
                  >
                    <Download className="size-3.5" strokeWidth={1.75} />
                    {item.cta.label}
                  </a>
                ) : (
                  <Link
                    href={item.cta.href}
                    className="mt-5 flex w-fit items-center gap-1.5 text-[13px] text-foreground transition-colors group-hover:text-accent"
                  >
                    {item.cta.label} <ArrowRight className="size-3.5" strokeWidth={1.75} />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </Container>

      {/* ---------- 6b · brand & artwork ---------- */}
      <Container className="mt-28 lg:mt-36">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="section-heading">The brand comes with it</h2>
            <p className="mt-1.5 text-[13px] text-muted">
              Every business gets branded robot artwork, the BOWYER mark, and a look that
              says premium — not template.
            </p>
          </div>
          <a
            href="/downloads/bowyer-brand-kit.zip"
            download
            className="flex h-10 items-center gap-2 rounded-sm border border-border px-5 text-[13px] text-foreground transition-colors hover:border-white/25"
          >
            <Download className="size-3.5" strokeWidth={1.75} />
            Download brand kit
          </a>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-4">
          {BRAND_ROBOTS.map((robot) => (
            <div key={robot.label} className="group relative bg-background">
              <Image
                src={robot.src}
                alt={`BOWYER ${robot.label} robot`}
                width={512}
                height={512}
                className="h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <span className="absolute bottom-3 left-4 text-[11px] uppercase tracking-[0.14em] text-white/60">
                {robot.label}
              </span>
            </div>
          ))}
        </div>
      </Container>

      {/* ---------- 7 · successful businesses ---------- */}
      <Container className="mt-28 lg:mt-36">
        <h2 className="section-heading">Built on BOWYER</h2>
        <p className="mt-1.5 text-[13px] text-muted">Not examples. Real businesses.</p>

        <div className="mt-10 rounded-sm border border-border bg-surface p-8 sm:p-10">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="min-w-0 max-w-xl">
              <div className="flex items-center gap-2">
                <h3 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">
                  Whale Hunter
                </h3>
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  <span className="size-1.5 rounded-full bg-accent" /> Live
                </span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                Institutional flow intelligence on Robinhood Chain. Scans real blocks over
                JSON-RPC, grounds every report in live web search, and takes paid
                subscriptions in ETH — verified on-chain before access unlocks.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  "Live on mainnet",
                  "Real chain scanner",
                  "Web-grounded reports",
                  "MCP tools",
                  "Chain 4663",
                ].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border px-3 py-1 text-[11.5px] text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-border pt-6">
            <Link
              href="/agents/whale-hunter"
              className="flex h-10 items-center gap-1.5 rounded-sm border border-border px-5 text-[13px] text-foreground transition-colors hover:border-white/25"
            >
              See it working <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
            </Link>
            <CopyButton text="npx create-agent --clone whale-hunter" className="text-[13px]" />
          </div>
        </div>
      </Container>

      {/* ---------- 8 · deploy ---------- */}
      <Container className="mt-28 lg:mt-36 pb-28">
        <div className="border-t border-border pt-20 text-center">
          <Image
            src="/images/bowyer-lockup.png"
            alt="BOWYER"
            width={1179}
            height={915}
            className="mx-auto mb-10 h-auto w-full max-w-[260px] object-contain"
          />
          <h2 className="mx-auto max-w-2xl text-[36px] sm:text-[48px] font-semibold tracking-[-0.03em] leading-[1.08] text-foreground text-balance">
            Launch your autonomous business.
          </h2>
          <p className="mt-4 text-[14px] text-muted">Built on Robinhood Chain.</p>
          <Link
            href="/launch"
            className="mt-9 inline-flex h-12 items-center rounded-sm bg-accent px-10 text-[15px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Start building
          </Link>
        </div>
      </Container>
    </>
  );
}
