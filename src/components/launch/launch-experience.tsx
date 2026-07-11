"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Check,
  Database,
  FileText,
  Github,
  Globe,
  ImageIcon,
  Key,
  LineChart,
  Lock,
  MessageCircle,
  Newspaper,
  Pencil,
  Rss,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
  Workflow,
  Zap,
} from "lucide-react";
import { Container } from "@/components/layout/container";
import { BYOK_PROVIDERS, PLATFORM_MODELS, llmConfigSummary } from "@/lib/llm-config";
import { shortAddress, useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

/* ================= wizard config ================= */

const STEPS = [
  "Direction",
  "Identity",
  "Brain",
  "Knowledge",
  "Capabilities",
  "Monetization",
  "Review",
] as const;

interface CategoryOption {
  id: string;
  title: string;
  sentence: string;
  detail: string;
  icon: typeof Zap;
  defaults: {
    capabilities: string[];
    model: string;
    priceUsd: number;
    goal: string;
  };
}

const CATEGORIES: CategoryOption[] = [
  {
    id: "Trading",
    title: "Trading Intelligence",
    sentence: "Watch markets and publish signals before the crowd reacts.",
    detail: "Flow monitoring, signal scoring, alert delivery.",
    icon: LineChart,
    defaults: {
      capabilities: ["monitor", "alerts", "reports"],
      model: "fast",
      priceUsd: 49,
      goal: "Find market signals before anyone else and alert subscribers instantly.",
    },
  },
  {
    id: "Research",
    title: "Research",
    sentence: "Read everything, write reports subscribers actually open.",
    detail: "Filings, data, deep analysis on a schedule.",
    icon: Search,
    defaults: {
      capabilities: ["research", "reports"],
      model: "balanced",
      priceUsd: 29,
      goal: "Produce one deeply researched report every day.",
    },
  },
  {
    id: "Macro",
    title: "Macro",
    sentence: "Track rates, sectors, and cross-asset context daily.",
    detail: "The morning brief your subscribers wake up to.",
    icon: Globe,
    defaults: {
      capabilities: ["research", "reports", "content"],
      model: "balanced",
      priceUsd: 39,
      goal: "Publish the definitive daily macro briefing.",
    },
  },
  {
    id: "Developer",
    title: "Developer Tools",
    sentence: "Expose your capability as tools other agents can call.",
    detail: "MCP endpoints, APIs, and infrastructure.",
    icon: Bot,
    defaults: {
      capabilities: ["workflows", "answers"],
      model: "balanced",
      priceUsd: 19,
      goal: "Serve reliable tool calls to other agents and IDEs.",
    },
  },
  {
    id: "Security",
    title: "Security",
    sentence: "Flag anomalies the moment they form on-chain.",
    detail: "Contract monitoring, wallet intelligence, alerts.",
    icon: ShieldCheck,
    defaults: {
      capabilities: ["monitor", "alerts"],
      model: "fast",
      priceUsd: 59,
      goal: "Detect anomalies and alert subscribers within seconds.",
    },
  },
  {
    id: "Automation",
    title: "Automation",
    sentence: "Run operations while your subscribers sleep.",
    detail: "Treasury, workflows, and scheduled execution.",
    icon: Workflow,
    defaults: {
      capabilities: ["workflows", "alerts"],
      model: "fast",
      priceUsd: 25,
      goal: "Execute scheduled operations flawlessly, 24/7.",
    },
  },
  {
    id: "Content",
    title: "Content",
    sentence: "Publish narratives people pay to read.",
    detail: "Newsletters, summaries, and market commentary.",
    icon: Newspaper,
    defaults: {
      capabilities: ["content", "reports", "social"],
      model: "deep",
      priceUsd: 15,
      goal: "Write content subscribers forward to their friends.",
    },
  },
];

const DEPTHS = [
  { id: "fast", label: "Fast", blurb: "Instant responses, light reasoning" },
  { id: "balanced", label: "Balanced", blurb: "Thinks when it matters" },
  { id: "deep", label: "Deep", blurb: "Maximum reasoning on every task" },
];

const SOURCES = [
  { id: "website", label: "Website", icon: Globe, live: true, placeholder: "https://example.com" },
  { id: "github", label: "GitHub", icon: Github, live: true, placeholder: "https://github.com/owner/repo" },
  { id: "rss", label: "RSS", icon: Rss, live: true, placeholder: "https://blog.example.com/feed.xml" },
  { id: "x", label: "X", icon: MessageCircle, live: true, placeholder: "" },
  { id: "pdf", label: "PDF", icon: FileText, live: false, placeholder: "" },
  { id: "notion", label: "Notion", icon: BookOpen, live: true, placeholder: "" },
  { id: "wallet", label: "Wallet", icon: Wallet, live: false, placeholder: "" },
  { id: "discord", label: "Discord", icon: MessageCircle, live: true, placeholder: "" },
  { id: "telegram", label: "Telegram", icon: Send, live: false, placeholder: "" },
  { id: "api", label: "Custom API", icon: Key, live: false, placeholder: "" },
];

interface ConnectedSource {
  type: string;
  url: string;
}

function sourceHostname(url: string): string {
  if (url.startsWith("notion://page/")) return "Notion page";
  if (url.startsWith("discord://channel/")) return "Discord channel";
  if (url.startsWith("x://user/")) return `@${url.replace("x://user/", "")}`;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const CAPABILITIES = [
  { id: "reports", label: "Publish reports", blurb: "Scheduled and event-driven publications", icon: FileText },
  { id: "monitor", label: "Monitor wallets", blurb: "Watch on-chain flows in real time", icon: Wallet },
  { id: "research", label: "Research markets", blurb: "Read filings, data, and the open web", icon: Search },
  { id: "answers", label: "Answer subscribers", blurb: "Respond to questions 24/7", icon: MessageCircle },
  { id: "social", label: "Post to X", blurb: "Share findings automatically", icon: Send },
  { id: "alerts", label: "Send alerts", blurb: "Webhook, email, and push delivery", icon: Bell },
  { id: "workflows", label: "Execute workflows", blurb: "Multi-step operations on schedule", icon: Workflow },
  { id: "content", label: "Generate content", blurb: "Newsletters, summaries, commentary", icon: Pencil },
];

const PRICING_MODELS = [
  { id: "Free", label: "Free", blurb: "Grow an audience first. Monetize later.", icon: Sparkles },
  { id: "Subscription", label: "Subscription", blurb: "Recurring monthly revenue. Most popular.", icon: Zap },
  { id: "Usage-based", label: "Usage-based", blurb: "Charge per report, call, or alert.", icon: Database },
  { id: "Enterprise", label: "Enterprise", blurb: "Custom contracts for teams.", icon: Lock },
  { id: "Holder access", label: "Holder access", blurb: "Free for BOWYER protocol stakers.", icon: ShieldCheck },
  { id: "API", label: "API", blurb: "Sell programmatic access to other agents.", icon: Key },
];

const PRICE_PRESETS = [9, 29, 49, 99];

/* ================= component ================= */

export function LaunchExperience() {
  const [step, setStep] = useState(0);

  // Step 1
  const [category, setCategory] = useState<CategoryOption | null>(null);
  // Step 2
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  // Step 3
  const [llmMode, setLlmMode] = useState<"platform" | "custom">("platform");
  const [model, setModel] = useState("balanced");
  const [byokProvider, setByokProvider] = useState<string>("groq");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customModel, setCustomModel] = useState("llama-3.3-70b-versatile");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [instructions, setInstructions] = useState("");
  const [depth, setDepth] = useState("balanced");
  const [memory, setMemory] = useState(true);
  const [goal, setGoal] = useState("");
  // Step 4
  const [sources, setSources] = useState<ConnectedSource[]>([]);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<
    { fullName: string; url: string; private: boolean; description: string | null }[]
  >([]);
  const [githubReposLoading, setGithubReposLoading] = useState(false);
  const [notionPages, setNotionPages] = useState<{ id: string; title: string; url: string }[]>([]);
  const [notionLoading, setNotionLoading] = useState(false);
  const [discordChannels, setDiscordChannels] = useState<
    { guildName: string; name: string; url: string }[]
  >([]);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [xAccounts, setXAccounts] = useState<{ username: string; name: string; url: string }[]>([]);
  const [xLoading, setXLoading] = useState(false);
  const searchParams = useSearchParams();
  // Step 5
  const [capabilities, setCapabilities] = useState<string[]>([]);
  // Step 6
  const [pricingModel, setPricingModel] = useState("Subscription");
  const [priceUsd, setPriceUsd] = useState(49);
  const [customPrice, setCustomPrice] = useState("");
  const [payoutAddress, setPayoutAddress] = useState("");
  const { address: walletAddress, connect: connectWallet, authenticate } = useWallet();

  // Default the payout address to the connected wallet.
  useEffect(() => {
    if (walletAddress && !payoutAddress) setPayoutAddress(walletAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  async function loadGithubRepos() {
    if (!walletAddress) return;
    setGithubReposLoading(true);
    try {
      const res = await fetch(`/api/auth/github/repos?wallet=${walletAddress}`);
      const json = await res.json();
      if (json.ok) setGithubRepos(json.repos ?? []);
    } catch {
      setGithubRepos([]);
    } finally {
      setGithubReposLoading(false);
    }
  }

  async function loadNotionPages() {
    if (!walletAddress) return;
    setNotionLoading(true);
    try {
      const res = await fetch(`/api/auth/notion/pages?wallet=${walletAddress}`);
      const json = await res.json();
      if (json.ok) setNotionPages(json.pages ?? []);
    } catch {
      setNotionPages([]);
    } finally {
      setNotionLoading(false);
    }
  }

  async function loadDiscordChannels() {
    if (!walletAddress) return;
    setDiscordLoading(true);
    try {
      const res = await fetch(`/api/auth/discord/channels?wallet=${walletAddress}`);
      const json = await res.json();
      if (json.ok) setDiscordChannels(json.channels ?? []);
    } catch {
      setDiscordChannels([]);
    } finally {
      setDiscordLoading(false);
    }
  }

  async function loadXAccounts() {
    if (!walletAddress) return;
    setXLoading(true);
    try {
      const res = await fetch(`/api/auth/x/accounts?wallet=${walletAddress}`);
      const json = await res.json();
      if (json.ok) setXAccounts(json.accounts ?? []);
    } catch {
      setXAccounts([]);
    } finally {
      setXLoading(false);
    }
  }

  function addPickedSource(type: string, url: string) {
    if (sources.some((s) => s.url === url)) {
      setSourceError("That source is already connected.");
      return;
    }
    if (sources.length >= 4) {
      setSourceError("Up to 4 sources per business for now.");
      return;
    }
    setSources([...sources, { type, url }]);
    setSourceError(null);
    setActiveSource(null);
  }

  async function beginOAuth(event: React.MouseEvent<HTMLAnchorElement>, provider: string) {
    event.preventDefault();
    if (!walletAddress || !(await authenticate())) {
      setSourceError("Sign your wallet session before connecting a source.");
      return;
    }
    window.location.assign(`/api/auth/${provider}?wallet=${walletAddress}&returnTo=/launch`);
  }

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    if (!oauth?.endsWith("_ok") || !walletAddress) return;
    const provider = oauth.replace("_ok", "");
    if (provider === "github") {
      loadGithubRepos();
      setActiveSource("github");
    } else if (provider === "notion") {
      loadNotionPages();
      setActiveSource("notion");
    } else if (provider === "discord") {
      loadDiscordChannels();
      setActiveSource("discord");
    } else if (provider === "x") {
      loadXAccounts();
      setActiveSource("x");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, walletAddress]);

  useEffect(() => {
    if (!walletAddress || !activeSource) return;
    if (activeSource === "github") loadGithubRepos();
    if (activeSource === "notion") loadNotionPages();
    if (activeSource === "discord") loadDiscordChannels();
    if (activeSource === "x") loadXAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource, walletAddress]);
  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<{ slug: string } | null>(null);

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  function pickCategory(c: CategoryOption) {
    setCategory(c);
    setCapabilities(c.defaults.capabilities);
    setModel(c.defaults.model);
    setPriceUsd(c.defaults.priceUsd);
    setGoal(c.defaults.goal);
    next();
  }

  function pickByokProvider(id: string) {
    setByokProvider(id);
    const p = BYOK_PROVIDERS.find((x) => x.id === id);
    if (p?.models[0]) setCustomModel(p.models[0]);
    if (p && p.baseUrl) setCustomBaseUrl("");
  }

  const selectedByok = BYOK_PROVIDERS.find((p) => p.id === byokProvider) ?? BYOK_PROVIDERS[0];

  function addSource() {
    if (!activeSource) return;
    const url = sourceUrl.trim();
    let valid = false;
    if (activeSource === "notion") valid = /^notion:\/\/page\//.test(url);
    else if (activeSource === "discord") valid = /^discord:\/\/channel\/\d+\/\d+/.test(url);
    else if (activeSource === "x") valid = /^x:\/\/user\/[A-Za-z0-9_]{1,15}$/.test(url);
    else {
      try {
        const u = new URL(url);
        valid = u.protocol === "https:" || u.protocol === "http:";
        if (activeSource === "github" && !/github\.com\/[^/]+\/[^/]+/.test(url)) {
          valid = false;
        }
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      setSourceError(
        activeSource === "github"
          ? "Enter a full repository URL, e.g. https://github.com/owner/repo"
          : activeSource === "notion" || activeSource === "discord" || activeSource === "x"
            ? "Connect the service above and pick from the list."
            : "Enter a full URL starting with https://"
      );
      return;
    }
    addPickedSource(activeSource, url);
    setSourceUrl("");
  }

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0 });
  }

  const canContinue = useMemo(() => {
    switch (step) {
      case 0:
        return category !== null;
      case 1:
        return name.trim().length > 1 && tagline.trim().length > 3;
      case 2:
        if (llmMode === "custom") {
          return customApiKey.trim().length >= 8 && customModel.trim().length >= 2;
        }
        return model !== "";
      case 3:
        return true;
      case 4:
        return capabilities.length > 0;
      case 5: {
        if (pricingModel === "") return false;
        const isPaid = !["Free", "Holder access"].includes(pricingModel);
        return !isPaid || /^0x[0-9a-fA-F]{40}$/.test(payoutAddress);
      }
      default:
        return true;
    }
  }, [step, category, name, tagline, model, llmMode, customApiKey, customModel, capabilities, pricingModel, payoutAddress]);

  async function launch() {
    if (!category) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!walletAddress || !(await authenticate())) {
        setError("Connect and sign your wallet to launch a business.");
        return;
      }
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          tagline,
          category: category.id,
          description: [
            description.trim() || `${tagline} ${goal}`.trim(),
            instructions.trim() && `Operating instructions: ${instructions.trim()}`,
            depth === "deep"
              ? "Reasoning depth: deep — reason thoroughly and show your working."
              : depth === "fast"
                ? "Reasoning depth: fast — answer quickly and concisely."
                : "",
          ]
            .filter(Boolean)
            .join("\n"),
          revenueModel: pricingModel === "Subscription" ? "Monthly subscription" : pricingModel,
          priceUsd: pricingModel === "Free" || pricingModel === "Holder access" ? 0 : priceUsd,
          creatorSharePct: 90,
          payoutAddress: payoutAddress || undefined,
          ownerAddress: walletAddress || payoutAddress || undefined,
          sources,
          llm:
            llmMode === "custom"
              ? {
                  mode: "custom",
                  apiKey: customApiKey.trim(),
                  model: customModel.trim(),
                  baseUrl:
                    byokProvider === "custom"
                      ? customBaseUrl.trim() || undefined
                      : selectedByok.baseUrl || undefined,
                }
              : { mode: "platform", model },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Launch failed — try again");
        return;
      }
      setLaunched({ slug: data.slug });
      window.scrollTo({ top: 0 });
    } catch {
      setError("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (launched) {
    return (
      <Container className="flex min-h-[75vh] max-w-xl flex-col items-center justify-center py-20 text-center">
        <AmbientVideo />
        <span className="flex size-14 items-center justify-center rounded-full bg-accent">
          <Check className="size-7 text-background" strokeWidth={2.5} />
        </span>
        <h1 className="mt-6 text-[30px] font-semibold tracking-[-0.02em] text-foreground">
          {name} is live.
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          Your business is registered on Robinhood Chain and listed on the marketplace. It is
          already working.
        </p>
        <div className="mt-9 flex gap-3">
          <Link
            href={`/agents/${launched.slug}`}
            className="flex h-11 items-center rounded-sm bg-accent px-6 text-[14px] font-medium text-background transition-opacity hover:opacity-90"
          >
            View your business
          </Link>
          <Link
            href="/marketplace"
            className="flex h-11 items-center rounded-sm border border-border px-6 text-[14px] text-foreground transition-colors hover:border-white/25"
          >
            See it listed
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container className="relative pt-8 pb-16">
      <AmbientVideo />

      {/* progress */}
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
            Found a business
          </p>
          <p className="text-[12px] tabular-nums text-subtle">
            {step + 1} / {STEPS.length} · {STEPS[step]}
          </p>
        </div>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
              className={cn(
                "h-[3px] flex-1 rounded-full transition-colors duration-300",
                i < step ? "bg-accent/60" : i === step ? "bg-accent" : "bg-white/10",
                i < step && "cursor-pointer hover:bg-accent"
              )}
              aria-label={label}
            />
          ))}
        </div>
      </div>

      {/* step body */}
      <div key={step} className="step-enter mx-auto mt-10 max-w-4xl lg:mt-14">
        {step === 0 && (
          <div>
            <StepTitle
              title="What are you building?"
              sub="Pick a direction. We'll configure sensible defaults — everything stays editable."
            />
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = category?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickCategory(c)}
                    className={cn(
                      "group flex flex-col rounded-2xl border p-5 text-left transition-all duration-150",
                      active
                        ? "border-accent/70 bg-accent/[0.05]"
                        : "border-border bg-surface hover:border-white/25 hover:bg-[#141414]"
                    )}
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-white/[0.06] transition-colors group-hover:bg-accent/15">
                      <Icon className="size-[18px] text-accent" strokeWidth={1.75} />
                    </span>
                    <span className="mt-4 text-[15px] font-semibold text-foreground">
                      {c.title}
                    </span>
                    <span className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                      {c.sentence}
                    </span>
                    <span className="mt-3 text-[11px] text-subtle">{c.detail}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
            <div>
              <StepTitle title="Identity" sub="How the world will see your business." />

              <div className="mt-8 flex flex-col gap-6">
                <div>
                  <FieldLabel>Business name</FieldLabel>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Whale Hunter"
                    autoFocus
                    className="mt-2 w-full border-b border-white/15 bg-transparent pb-2 text-[28px] font-semibold tracking-[-0.02em] text-foreground outline-none transition-colors placeholder:text-white/15 focus:border-accent/60"
                  />
                </div>
                <div>
                  <FieldLabel>Tagline</FieldLabel>
                  <input
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="One sentence that explains what it does"
                    className="mt-2 w-full border-b border-white/15 bg-transparent pb-2 text-[16px] text-foreground outline-none transition-colors placeholder:text-white/15 focus:border-accent/60"
                  />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                    placeholder="What it does, how it works, why it matters."
                    rows={3}
                    className="mt-2 w-full resize-none border-b border-white/15 bg-transparent pb-2 text-[14px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-white/15 focus:border-accent/60"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => avatarInput.current?.click()}
                    className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/15 transition-colors hover:border-accent/50"
                  >
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-subtle">
                        <ImageIcon className="size-4" strokeWidth={1.5} />
                        <span className="text-[10px]">Avatar</span>
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => bannerInput.current?.click()}
                    className="flex h-20 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/15 transition-colors hover:border-accent/50"
                  >
                    {banner ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={banner} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="flex items-center gap-2 text-subtle">
                        <ImageIcon className="size-4" strokeWidth={1.5} />
                        <span className="text-[11px]">Banner — 1600×900</span>
                      </span>
                    )}
                  </button>
                  <input
                    ref={avatarInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setAvatar(URL.createObjectURL(f));
                    }}
                  />
                  <input
                    ref={bannerInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setBanner(URL.createObjectURL(f));
                    }}
                  />
                </div>
              </div>
            </div>

            {/* live preview */}
            <div className="lg:pt-16">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
                Live preview
              </p>
              <PreviewCard
                name={name}
                tagline={tagline}
                category={category?.id ?? ""}
                avatar={avatar}
                banner={banner}
                pricingModel={pricingModel}
                priceUsd={priceUsd}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <StepTitle
              title="How should your business think?"
              sub="Use BOWYER's hosted models or bring your own API key."
            />

            <div className="mt-8 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLlmMode("platform")}
                className={cn(
                  "rounded-full border px-4 py-2 text-[13px] transition-colors",
                  llmMode === "platform"
                    ? "border-accent/70 bg-accent/[0.08] text-foreground"
                    : "border-border text-muted hover:border-white/25"
                )}
              >
                BOWYER models
              </button>
              <button
                type="button"
                onClick={() => setLlmMode("custom")}
                className={cn(
                  "rounded-full border px-4 py-2 text-[13px] transition-colors",
                  llmMode === "custom"
                    ? "border-accent/70 bg-accent/[0.08] text-foreground"
                    : "border-border text-muted hover:border-white/25"
                )}
              >
                Your API key
              </button>
            </div>

            {llmMode === "platform" ? (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {PLATFORM_MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModel(m.id)}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition-colors",
                        model === m.id
                          ? "border-accent/70 bg-accent/[0.05]"
                          : "border-border bg-surface hover:border-white/25"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Brain
                            className={cn(
                              "size-4",
                              model === m.id ? "text-accent" : "text-muted"
                            )}
                            strokeWidth={1.75}
                          />
                          <span className="text-[14px] font-semibold text-foreground">
                            {m.name}
                          </span>
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-subtle">
                          {m.badge}
                        </span>
                      </span>
                      <span className="mt-1.5 block text-[12px] leading-relaxed text-muted">
                        {m.blurb}
                      </span>
                      <span className="mt-2 block font-mono text-[10.5px] text-subtle">
                        {m.model}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[12px] text-subtle">
                  Powered by BOWYER&apos;s LLM — no key required. Usage limits apply on the free
                  tier.
                </p>
              </>
            ) : (
              <div className="mt-6 space-y-5 rounded-2xl border border-border bg-surface p-5">
                <div>
                  <FieldLabel>Provider</FieldLabel>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {BYOK_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickByokProvider(p.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                          byokProvider === p.id
                            ? "border-accent/70 bg-accent/[0.08] text-foreground"
                            : "border-border text-muted hover:border-white/25"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <FieldLabel>API key</FieldLabel>
                  <input
                    type="password"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder={selectedByok.keyHint}
                    autoComplete="off"
                    className="mt-2 h-11 w-full rounded-sm border border-border bg-background px-4 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-accent/60"
                  />
                  <p className="mt-2 text-[11.5px] text-subtle">
                    Stored server-side for this business only. Never shown publicly or returned
                    in API responses.
                  </p>
                </div>

                {selectedByok.models.length > 0 ? (
                  <div>
                    <FieldLabel>Model</FieldLabel>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedByok.models.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setCustomModel(m)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 font-mono text-[11.5px] transition-colors",
                            customModel === m
                              ? "border-accent/70 bg-accent/[0.08] text-foreground"
                              : "border-border text-muted hover:border-white/25"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <FieldLabel>Model</FieldLabel>
                    <input
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="gpt-4o-mini"
                      className="mt-2 h-11 w-full rounded-sm border border-border bg-background px-4 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-accent/60"
                    />
                  </div>
                )}

                {byokProvider === "custom" && (
                  <div>
                    <FieldLabel>Base URL</FieldLabel>
                    <input
                      type="url"
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="mt-2 h-11 w-full rounded-sm border border-border bg-background px-4 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-accent/60"
                    />
                  </div>
                )}

                <p className="text-[12px] text-subtle">
                  We verify your key when you launch. You pay your provider directly — BOWYER
                  never bills you for inference.
                </p>
              </div>
            )}

            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <div>
                <FieldLabel>System instructions</FieldLabel>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={`You are ${name || "my business"}. You ${category?.sentence.toLowerCase() ?? "work for your subscribers"}`}
                  rows={4}
                  className="mt-2 w-full resize-none rounded-xl border border-border bg-surface p-4 text-[13px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-white/20 focus:border-accent/50"
                />
              </div>

              <div className="flex flex-col gap-6">
                <div>
                  <FieldLabel>Reasoning depth</FieldLabel>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {DEPTHS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDepth(d.id)}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-center transition-colors",
                          depth === d.id
                            ? "border-accent/70 bg-accent/[0.05] text-foreground"
                            : "border-border text-muted hover:border-white/25"
                        )}
                      >
                        <span className="block text-[13px] font-medium">{d.label}</span>
                        <span className="mt-0.5 block text-[10.5px] text-subtle">{d.blurb}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">Memory</p>
                    <p className="text-[11.5px] text-muted">
                      Remembers everything it has seen and published
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMemory(!memory)}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors",
                      memory ? "bg-accent" : "bg-white/15"
                    )}
                    aria-pressed={memory}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-5 rounded-full bg-background transition-transform",
                        memory ? "translate-x-[22px]" : "translate-x-0.5"
                      )}
                    />
                  </button>
                </div>

                <div>
                  <FieldLabel>Goal</FieldLabel>
                  <input
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    className="mt-2 w-full border-b border-white/15 bg-transparent pb-2 text-[14px] text-foreground outline-none transition-colors focus:border-accent/60"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <StepTitle
              title="What should it know?"
              sub="Connect knowledge sources. Your business reads them continuously."
            />

            {sources.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {sources.map((src) => {
                  const s = SOURCES.find((x) => x.id === src.type);
                  return (
                    <button
                      key={src.url}
                      type="button"
                      onClick={() => setSources(sources.filter((x) => x.url !== src.url))}
                      title="Remove source"
                      className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-[12px] text-accent transition-colors hover:bg-accent/20"
                    >
                      <Check className="size-3" strokeWidth={2.5} />
                      {s?.label ?? src.type} · {sourceHostname(src.url)}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {SOURCES.map((s) => {
                const Icon = s.icon;
                const connected = sources.some((x) => x.type === s.id);
                const isActive = activeSource === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!s.live}
                    onClick={() => {
                      setSourceError(null);
                      setSourceUrl("");
                      setActiveSource(isActive ? null : s.id);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-3 rounded-2xl border py-6 transition-colors",
                      !s.live && "cursor-not-allowed opacity-45",
                      connected || isActive
                        ? "border-accent/70 bg-accent/[0.05]"
                        : "border-border bg-surface",
                      s.live && !connected && !isActive && "hover:border-white/25"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-5",
                        connected || isActive ? "text-accent" : "text-muted"
                      )}
                      strokeWidth={1.5}
                    />
                    <span
                      className={cn(
                        "text-[12.5px]",
                        connected || isActive ? "text-foreground" : "text-muted"
                      )}
                    >
                      {s.label}
                    </span>
                    <span
                      className={cn(
                        "text-[10px]",
                        connected ? "text-accent" : "text-subtle"
                      )}
                    >
                      {!s.live ? "Coming soon" : connected ? "Connected" : "Connect"}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeSource && (
              <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
                {activeSource === "github" && (
                  <>
                    <p className="text-[12.5px] text-muted">
                      Connect GitHub to pick a repository, or paste a URL manually.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {walletAddress ? (
                        <a
                          href={`/api/auth/github?wallet=${walletAddress}&returnTo=/launch`}
                          onClick={(event) => beginOAuth(event, "github")}
                          className="flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-[13px] text-foreground hover:border-white/25"
                        >
                          <Github className="size-4" /> Connect GitHub
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => connectWallet()}
                          className="flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-[13px] text-foreground hover:border-white/25"
                        >
                          <Wallet className="size-4" /> Connect wallet first
                        </button>
                      )}
                    </div>
                    {githubReposLoading && (
                      <p className="mt-4 text-[12px] text-subtle">Loading your repositories…</p>
                    )}
                    {githubRepos.length > 0 && (
                      <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto border-t border-border pt-3">
                        {githubRepos.map((repo) => (
                          <li key={repo.url}>
                            <button
                              type="button"
                              onClick={() => addPickedSource("github", repo.url)}
                              className="flex w-full flex-col rounded-sm px-2 py-2 text-left hover:bg-white/[0.04]"
                            >
                              <span className="text-[13px] text-foreground">{repo.fullName}</span>
                              {repo.description && (
                                <span className="truncate text-[11px] text-subtle">
                                  {repo.description}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-4 text-[12px] text-subtle">Or paste a repository URL:</p>
                  </>
                )}

                {activeSource === "notion" && (
                  <>
                    <p className="text-[12.5px] text-muted">
                      Connect Notion to pick a page your business reads on every run.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {walletAddress ? (
                        <a
                          href={`/api/auth/notion?wallet=${walletAddress}&returnTo=/launch`}
                          onClick={(event) => beginOAuth(event, "notion")}
                          className="flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-[13px] text-foreground hover:border-white/25"
                        >
                          <BookOpen className="size-4" /> Connect Notion
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => connectWallet()}
                          className="flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-[13px] text-foreground hover:border-white/25"
                        >
                          <Wallet className="size-4" /> Connect wallet first
                        </button>
                      )}
                    </div>
                    {notionLoading && (
                      <p className="mt-4 text-[12px] text-subtle">Loading your pages…</p>
                    )}
                    {notionPages.length > 0 && (
                      <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto border-t border-border pt-3">
                        {notionPages.map((page) => (
                          <li key={page.url}>
                            <button
                              type="button"
                              onClick={() => addPickedSource("notion", page.url)}
                              className="flex w-full rounded-sm px-2 py-2 text-left text-[13px] text-foreground hover:bg-white/[0.04]"
                            >
                              {page.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {activeSource === "discord" && (
                  <>
                    <p className="text-[12.5px] text-muted">
                      Connect Discord, then pick a channel. The Bowyer bot must be in that server.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {walletAddress ? (
                        <a
                          href={`/api/auth/discord?wallet=${walletAddress}&returnTo=/launch`}
                          onClick={(event) => beginOAuth(event, "discord")}
                          className="flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-[13px] text-foreground hover:border-white/25"
                        >
                          <MessageCircle className="size-4" /> Connect Discord
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => connectWallet()}
                          className="flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-[13px] text-foreground hover:border-white/25"
                        >
                          <Wallet className="size-4" /> Connect wallet first
                        </button>
                      )}
                    </div>
                    {discordLoading && (
                      <p className="mt-4 text-[12px] text-subtle">Loading channels…</p>
                    )}
                    {discordChannels.length > 0 && (
                      <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto border-t border-border pt-3">
                        {discordChannels.map((ch) => (
                          <li key={ch.url}>
                            <button
                              type="button"
                              onClick={() => addPickedSource("discord", ch.url)}
                              className="flex w-full flex-col rounded-sm px-2 py-2 text-left hover:bg-white/[0.04]"
                            >
                              <span className="text-[13px] text-foreground">#{ch.name}</span>
                              <span className="text-[11px] text-subtle">{ch.guildName}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {activeSource === "x" && (
                  <>
                    <p className="text-[12.5px] text-muted">
                      Connect X to ingest your recent posts as live knowledge.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {walletAddress ? (
                        <a
                          href={`/api/auth/x?wallet=${walletAddress}&returnTo=/launch`}
                          onClick={(event) => beginOAuth(event, "x")}
                          className="flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-[13px] text-foreground hover:border-white/25"
                        >
                          <MessageCircle className="size-4" /> Connect X
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => connectWallet()}
                          className="flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-[13px] text-foreground hover:border-white/25"
                        >
                          <Wallet className="size-4" /> Connect wallet first
                        </button>
                      )}
                    </div>
                    {xLoading && (
                      <p className="mt-4 text-[12px] text-subtle">Loading your profile…</p>
                    )}
                    {xAccounts.length > 0 && (
                      <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto border-t border-border pt-3">
                        {xAccounts.map((acct) => (
                          <li key={acct.url}>
                            <button
                              type="button"
                              onClick={() => addPickedSource("x", acct.url)}
                              className="flex w-full flex-col rounded-sm px-2 py-2 text-left hover:bg-white/[0.04]"
                            >
                              <span className="text-[13px] text-foreground">@{acct.username}</span>
                              {acct.name && (
                                <span className="text-[11px] text-subtle">{acct.name}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {(activeSource === "website" || activeSource === "rss") && (
                  <p className="text-[12.5px] text-muted">
                    {activeSource === "rss"
                      ? "Paste an RSS or Atom feed URL. Your business reads the latest items."
                      : "Paste a public webpage URL. Your business reads its content."}
                  </p>
                )}

                {(activeSource === "website" ||
                  activeSource === "rss" ||
                  activeSource === "github") && (
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => {
                        setSourceUrl(e.target.value);
                        setSourceError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSource();
                        }
                      }}
                      placeholder={
                        SOURCES.find((s) => s.id === activeSource)?.placeholder ?? "https://"
                      }
                      className="h-11 flex-1 rounded-sm border border-border bg-background px-4 text-[13.5px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-accent/60"
                    />
                    <button
                      type="button"
                      onClick={addSource}
                      className="flex h-11 shrink-0 items-center justify-center rounded-sm bg-accent px-6 text-[13px] font-medium text-black transition-opacity hover:opacity-90"
                    >
                      Add source
                    </button>
                  </div>
                )}
                {sourceError && (
                  <p className="mt-2 text-[12px] text-red-400">{sourceError}</p>
                )}
              </div>
            )}

            <p className="mt-5 text-[12px] text-subtle">
              Optional — connected sources are fetched live every time your business writes
              a report or answers a question.
            </p>
          </div>
        )}

        {step === 4 && (
          <div>
            <StepTitle
              title="What can it do?"
              sub={`Preselected for ${category?.title ?? "your direction"} — adjust freely.`}
            />
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CAPABILITIES.map((c) => {
                const Icon = c.icon;
                const active = capabilities.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setCapabilities(
                        active
                          ? capabilities.filter((x) => x !== c.id)
                          : [...capabilities, c.id]
                      )
                    }
                    className={cn(
                      "relative flex flex-col rounded-2xl border p-5 text-left transition-colors",
                      active
                        ? "border-accent/70 bg-accent/[0.05]"
                        : "border-border bg-surface hover:border-white/25"
                    )}
                  >
                    {active && (
                      <span className="absolute right-3.5 top-3.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent">
                        <Check className="size-2.5 text-background" strokeWidth={3} />
                      </span>
                    )}
                    <Icon
                      className={cn("size-5", active ? "text-accent" : "text-muted")}
                      strokeWidth={1.5}
                    />
                    <span className="mt-3 text-[13.5px] font-medium text-foreground">
                      {c.label}
                    </span>
                    <span className="mt-1 text-[11.5px] leading-relaxed text-muted">
                      {c.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <StepTitle title="How does it earn?" sub="You keep 90% of everything. Always." />
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PRICING_MODELS.map((p) => {
                const Icon = p.icon;
                const active = pricingModel === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPricingModel(p.id)}
                    className={cn(
                      "flex flex-col rounded-2xl border p-5 text-left transition-colors",
                      active
                        ? "border-accent/70 bg-accent/[0.05]"
                        : "border-border bg-surface hover:border-white/25"
                    )}
                  >
                    <Icon
                      className={cn("size-5", active ? "text-accent" : "text-muted")}
                      strokeWidth={1.5}
                    />
                    <span className="mt-3 text-[14px] font-semibold text-foreground">
                      {p.label}
                    </span>
                    <span className="mt-1 text-[12px] leading-relaxed text-muted">{p.blurb}</span>
                  </button>
                );
              })}
            </div>

            {pricingModel === "Subscription" && (
              <div className="step-enter mt-8 rounded-2xl border border-border bg-surface p-6">
                <FieldLabel>Monthly price</FieldLabel>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {PRICE_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPriceUsd(p);
                        setCustomPrice("");
                      }}
                      className={cn(
                        "h-11 rounded-xl border px-5 text-[15px] font-medium tabular-nums transition-colors",
                        priceUsd === p && !customPrice
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-muted hover:border-white/25"
                      )}
                    >
                      ${p}
                    </button>
                  ))}
                  <div
                    className={cn(
                      "flex h-11 items-center gap-1 rounded-xl border px-4 transition-colors",
                      customPrice
                        ? "border-accent bg-accent/10"
                        : "border-border"
                    )}
                  >
                    <span className={customPrice ? "text-accent" : "text-subtle"}>$</span>
                    <input
                      value={customPrice}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                        setCustomPrice(v);
                        if (v) setPriceUsd(Number(v));
                      }}
                      placeholder="Custom"
                      className={cn(
                        "w-16 bg-transparent text-[15px] font-medium tabular-nums outline-none placeholder:text-white/20",
                        customPrice ? "text-accent" : "text-foreground"
                      )}
                    />
                  </div>
                </div>
                <p className="mt-4 text-[12.5px] text-muted">
                  You earn <span className="tabular-nums text-accent">${Math.round(priceUsd * 0.9 * 100) / 100}</span>{" "}
                  per subscriber per month · protocol takes 10%
                </p>
              </div>
            )}

            {!["Free", "Holder access"].includes(pricingModel) && (
              <div className="step-enter mt-5 rounded-2xl border border-border bg-surface p-6">
                <FieldLabel>Payout wallet</FieldLabel>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  Subscriber payments are sent directly to this address on Robinhood Chain.
                </p>
                {walletAddress ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="flex h-11 items-center gap-2 rounded-xl border border-accent/50 bg-accent/[0.06] px-4 font-mono text-[13px] text-foreground">
                      <span className="size-1.5 rounded-full bg-accent" />
                      {shortAddress(walletAddress)}
                    </span>
                    {payoutAddress !== walletAddress && (
                      <button
                        type="button"
                        onClick={() => setPayoutAddress(walletAddress)}
                        className="text-[12.5px] text-muted underline underline-offset-2 hover:text-foreground"
                      >
                        Use connected wallet
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void connectWallet()}
                    className="mt-3 flex h-11 items-center rounded-xl bg-accent px-5 text-[13.5px] font-medium text-background transition-opacity hover:opacity-90"
                  >
                    Connect wallet to get paid
                  </button>
                )}
                <input
                  value={payoutAddress}
                  onChange={(e) => setPayoutAddress(e.target.value.trim())}
                  placeholder="0x… payout address"
                  className="input-dark mt-3 font-mono text-[13px]"
                  spellCheck={false}
                />
                {payoutAddress && !/^0x[0-9a-fA-F]{40}$/.test(payoutAddress) && (
                  <p className="mt-2 text-[12px] text-negative">
                    That doesn&apos;t look like a valid address.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === 6 && category && (
          <div>
            <StepTitle title="Review and launch" sub="Everything can be changed after launch." />

            <div className="mt-8 grid gap-8 lg:grid-cols-[360px_1fr]">
              <PreviewCard
                name={name}
                tagline={tagline}
                category={category.id}
                avatar={avatar}
                banner={banner}
                pricingModel={pricingModel}
                priceUsd={priceUsd}
              />

              <div className="flex flex-col">
                <dl className="divide-y divide-border">
                  <ReviewRow label="Direction" value={category.title} />
                  <ReviewRow
                    label="Brain"
                    value={`${llmConfigSummary(
                      llmMode === "custom"
                        ? {
                            mode: "custom",
                            model: customModel,
                            baseUrl:
                              byokProvider === "custom"
                                ? customBaseUrl
                                : selectedByok.baseUrl,
                          }
                        : { mode: "platform", model }
                    )} · ${DEPTHS.find((d) => d.id === depth)?.label} · ${
                      memory ? "Memory on" : "Memory off"
                    }`}
                  />
                  <ReviewRow
                    label="Knowledge"
                    value={
                      sources.length > 0
                        ? sources
                            .map(
                              (src) =>
                                `${SOURCES.find((s) => s.id === src.type)?.label ?? src.type} (${sourceHostname(src.url)})`
                            )
                            .join(" · ")
                        : "Connect after launch"
                    }
                  />
                  <ReviewRow
                    label="Capabilities"
                    value={capabilities
                      .map((id) => CAPABILITIES.find((c) => c.id === id)?.label)
                      .join(" · ")}
                  />
                  <ReviewRow
                    label="Pricing"
                    value={
                      pricingModel === "Subscription"
                        ? `$${priceUsd}/month · you keep 90%`
                        : pricingModel
                    }
                  />
                  {!["Free", "Holder access"].includes(pricingModel) && payoutAddress && (
                    <ReviewRow label="Payouts to" value={shortAddress(payoutAddress)} />
                  )}
                  <ReviewRow label="Network" value="Robinhood Chain · 4663" />
                  <ReviewRow label="Estimated launch time" value="~2 minutes" accent />
                </dl>

                {error && (
                  <p className="mt-5 rounded-xl border border-negative/40 bg-negative/[0.06] px-4 py-3 text-[13px] text-negative">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={launch}
                  disabled={submitting}
                  className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Launching on Robinhood Chain…" : "Launch Business"}
                </button>
                <p className="mt-3 text-center text-[11.5px] text-subtle">
                  Live on the marketplace the moment it deploys.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* nav */}
      {step > 0 && step < STEPS.length - 1 && (
        <div className="mx-auto mt-12 flex max-w-4xl items-center justify-between">
          <button
            type="button"
            onClick={back}
            className="flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} /> Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!canContinue}
            className="flex h-11 items-center gap-2 rounded-sm bg-accent px-7 text-[14px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            Continue <ArrowRight className="size-4" strokeWidth={2} />
          </button>
        </div>
      )}
      {step === STEPS.length - 1 && (
        <div className="mx-auto mt-10 max-w-4xl">
          <button
            type="button"
            onClick={back}
            className="flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} /> Back
          </button>
        </div>
      )}
    </Container>
  );
}

/* ================= pieces ================= */

/** Fixed, dimmed looping video that sits behind the whole launch wizard. */
function AmbientVideo() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="h-full w-full object-cover opacity-25"
        src="/videos/launch.mp4"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
    </div>
  );
}

function StepTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-[30px] sm:text-[36px] font-semibold tracking-[-0.03em] leading-tight text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-[14px] text-muted">{sub}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
      {children}
    </span>
  );
}

function ReviewRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5">
      <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-right text-[13px] font-medium",
          accent ? "text-accent" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function PreviewCard({
  name,
  tagline,
  category,
  avatar,
  banner,
  pricingModel,
  priceUsd,
}: {
  name: string;
  tagline: string;
  category: string;
  avatar: string | null;
  banner: string | null;
  pricingModel: string;
  priceUsd: number;
}) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-surface">
      <div className="relative h-28">
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-gradient-to-br from-accent/15 via-surface to-surface" />
        )}
        <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] text-foreground backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-accent" /> Live
        </span>
      </div>
      <div className="p-5">
        <div className="-mt-11 mb-3 flex size-12 items-center justify-center overflow-hidden rounded-xl border-2 border-surface bg-[#1a1a1a] text-[18px] font-semibold text-accent">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="size-full object-cover" />
          ) : (
            (name.trim()[0] ?? "?").toUpperCase()
          )}
        </div>
        <p className="text-[16px] font-semibold text-foreground">
          {name.trim() || "Your business"}
        </p>
        <p className="mt-1 line-clamp-2 min-h-[34px] text-[12.5px] leading-relaxed text-muted">
          {tagline.trim() || "Your tagline appears here."}
        </p>
        <div className="mt-3 flex items-center justify-between">
          {category ? (
            <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-muted">
              {category}
            </span>
          ) : (
            <span />
          )}
          <span className="text-[13px] font-medium text-foreground">
            {pricingModel === "Free" || pricingModel === "Holder access"
              ? "Free"
              : pricingModel === "Subscription"
                ? `$${priceUsd} / mo`
                : pricingModel}
          </span>
        </div>
      </div>
    </div>
  );
}
