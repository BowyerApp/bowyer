"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  GitFork,
  Star,
  Users,
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

/** Real open-source projects whose patterns power BOWYER — see src/lib/github-sources.ts */
const REPOS = [
  {
    name: "modelcontextprotocol/typescript-sdk",
    description:
      "Powers our live MCP endpoints at /api/mcp/[slug] — JSON-RPC tools/list and tools/call.",
    stars: "12.1K",
    forks: "1.4K",
    contributors: 220,
  },
  {
    name: "smithery-ai/cli",
    description:
      "The publish flow behind agent listing — smithery mcp publish, auth, and URL validation.",
    stars: "1.8K",
    forks: 142,
    contributors: 36,
  },
  {
    name: "dukelyuu/skills-marketplace",
    description:
      "Marketplace catalog patterns — command palette search, rankings, and related items.",
    stars: "940",
    forks: 87,
    contributors: 12,
  },
  {
    name: "pacocoursey/cmdk",
    description: "The ⌘K command palette UX used across every page of BOWYER.",
    stars: "11.6K",
    forks: 320,
    contributors: 64,
  },
  {
    name: "loonghao/agentverse",
    description:
      "Artifact kinds, semantic versioning, and the namespace registry format for listings.",
    stars: "620",
    forks: 54,
    contributors: 9,
  },
  {
    name: "geelen/mcp-remote",
    description:
      "Stdio bridge for remote HTTP MCP servers — used in agent connect snippets.",
    stars: "2.3K",
    forks: 178,
    contributors: 21,
  },
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

      {/* ---------- 6 · open source ---------- */}
      <Container className="mt-28 lg:mt-36">
        <h2 className="section-heading">Open source</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          The platform is built in public. Clone anything.
        </p>

        <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
          {REPOS.map((repo) => (
            <div key={repo.name} className="flex flex-col bg-background p-7">
              <p className="break-all font-mono text-[14px] text-foreground">{repo.name}</p>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">
                {repo.description}
              </p>
              <div className="mt-5 flex items-center justify-between">
                <div className="flex items-center gap-5 text-[12px] text-subtle">
                  <span className="flex items-center gap-1.5">
                    <Star className="size-3.5" strokeWidth={1.5} />
                    {repo.stars}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <GitFork className="size-3.5" strokeWidth={1.5} />
                    {repo.forks}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5" strokeWidth={1.5} />
                    {repo.contributors}
                  </span>
                </div>
                <CopyButton text={`git clone https://github.com/${repo.name}.git`} />
              </div>
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
                Institutional flow intelligence. Trading Agent template, custom cluster-detection
                model, four data sources — publishing to paying subscribers since February.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Trading template", "GPT-5", "4 data sources", "MCP tools", "Chain 4663"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border px-3 py-1 text-[11.5px] text-muted"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="flex gap-10">
              <div>
                <p className="text-[26px] font-semibold tabular-nums text-foreground">842</p>
                <p className="text-[12px] text-subtle">Subscribers</p>
              </div>
              <div>
                <p className="text-[26px] font-semibold tabular-nums text-foreground">$41.3K</p>
                <p className="text-[12px] text-subtle">Revenue to date</p>
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
