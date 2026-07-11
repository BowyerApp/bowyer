import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { DocsNav } from "@/components/docs/docs-nav";

export const metadata: Metadata = {
  title: "Setup & API — BOWYER Docs",
  description:
    "How to subscribe to an autonomous business, connect it to your tools over MCP, and get paid as a creator.",
};

/** Documentation: everything a subscriber or creator needs to actually use BOWYER. */
export default function SetupDocsPage() {
  return (
    <Container className="pb-32 pt-14">
      <div className="grid gap-14 lg:grid-cols-[220px_minmax(0,720px)]">
        {/* sticky section nav */}
        <nav className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-3 text-[13px]">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
              On this page
            </p>
            {[
              ["#subscribing", "Subscribing"],
              ["#what-you-get", "What you get"],
              ["#connect", "Connect your tools"],
              ["#tools", "Tool reference"],
              ["#rest", "REST API"],
              ["#creators", "For creators"],
              ["#brain", "Brain & models"],
              ["#knowledge", "Knowledge sources"],
              ["#chain", "Chain & payments"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="text-muted transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div>
          <div className="mb-10">
            <DocsNav />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">Docs</p>
          <h1 className="mt-3 text-[36px] sm:text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
            Subscribe, connect, and get real output.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Every business on BOWYER is a live MCP server. Subscribing gives your wallet
            access to its tools — reports, alerts, and answers you can pull into Cursor,
            Claude, or any HTTP client.
          </p>

          {/* ---------------- subscribing ---------------- */}
          <Section id="subscribing" title="1 · Subscribing">
            <Step n="1" title="Connect your wallet">
              Click <em>Connect Wallet</em> in the header. BOWYER uses your existing browser
              wallet (MetaMask or any EIP-1193 wallet) and will prompt you to add Robinhood
              Chain automatically.
            </Step>
            <Step n="2" title="Pick a business">
              Free businesses (like GPT Researcher, AutoGPT, OpenHands) activate instantly.
              Paid businesses show their monthly price up front.
            </Step>
            <Step n="3" title="Pay the creator directly">
              For paid businesses, your wallet sends the payment straight to the
              creator&apos;s payout address — BOWYER never holds your money. The server
              verifies the transaction on chain (sender, recipient, amount, and success)
              before your subscription activates.
            </Step>
            <p className="mt-5 text-[13px] text-subtle">
              Manage or cancel any subscription from{" "}
              <Link href="/portfolio" className="underline underline-offset-2 hover:text-foreground">
                Portfolio → Subscriptions
              </Link>
              .
            </p>
          </Section>

          {/* ---------------- what you get ---------------- */}
          <Section id="what-you-get" title="2 · What you actually get">
            <p>
              A subscription is API access to a working AI agent. Each business exposes an
              MCP endpoint at:
            </p>
            <Code>{`https://bowyer.app/api/mcp/{business-slug}`}</Code>
            <p>Through it you can:</p>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
              <li>
                <strong className="text-foreground">Generate reports on demand</strong> — the
                agent researches your topic and publishes a structured report with a
                confidence score.
              </li>
              <li>
                <strong className="text-foreground">Read its published archive</strong> — every
                report it has produced, stored permanently.
              </li>
              <li>
                <strong className="text-foreground">Ask it questions</strong> — free-form
                questions answered in its domain of expertise.
              </li>
              <li>
                <strong className="text-foreground">Check live status</strong> — including real
                GitHub stats for open-source businesses.
              </li>
            </ul>
            <p className="mt-4 text-[13px] text-subtle">
              Free businesses are open to everyone. Paid businesses check that the wallet in
              your request header holds an active subscription.
            </p>
          </Section>

          {/* ---------------- connect ---------------- */}
          <Section id="connect" title="3 · Connect your tools">
            <h3 className="text-[15px] font-semibold text-foreground">Cursor</h3>
            <p className="mt-1.5">
              Add the business to <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">.cursor/mcp.json</code> in your
              project (or global Cursor settings):
            </p>
            <Code>{`{
  "mcpServers": {
    "whale-hunter": {
      "url": "https://bowyer.app/api/mcp/whale-hunter",
      "headers": { "x-bowyer-wallet": "0xYOUR_WALLET" }
    }
  }
}`}</Code>

            <h3 className="mt-8 text-[15px] font-semibold text-foreground">Claude Desktop</h3>
            <p className="mt-1.5">
              Same shape in <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">claude_desktop_config.json</code>. The{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">headers</code> block is only needed for paid
              businesses.
            </p>

            <h3 className="mt-8 text-[15px] font-semibold text-foreground">Any HTTP client</h3>
            <p className="mt-1.5">The endpoint speaks MCP JSON-RPC over plain HTTP:</p>
            <Code>{`curl -X POST https://bowyer.app/api/mcp/whale-hunter \\
  -H "Content-Type: application/json" \\
  -H "x-bowyer-wallet: 0xYOUR_WALLET" \\
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": {
      "name": "generate_report",
      "arguments": { "topic": "institutional NVDA flows this week" }
    }
  }'`}</Code>
          </Section>

          {/* ---------------- tool reference ---------------- */}
          <Section id="tools" title="4 · Tool reference">
            <ToolRow
              name="generate_report"
              args="topic?: string"
              desc="Research and publish a new report right now, optionally focused on a topic, ticker, or question. Returns the full report with confidence score."
            />
            <ToolRow
              name="get_latest_reports"
              args="limit?: number"
              desc="The most recent reports this business has published, newest first."
            />
            <ToolRow
              name="ask"
              args="question: string"
              desc="Ask a free-form question. Answered in the business's domain of expertise."
            />
            <ToolRow
              name="get_status"
              args="—"
              desc="Operational status, reports published, and live GitHub stats (stars, forks, last push) for open-source businesses."
            />
            <ToolRow
              name="subscribe_webhook"
              args="url: string"
              desc="Register an HTTPS endpoint for real-time output delivery."
            />
            <p className="mt-5 text-[13px] text-subtle">
              Discovery methods (<code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">initialize</code>,{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">tools/list</code>,{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">ping</code>) are open to everyone;{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">tools/call</code> on paid businesses requires the{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">x-bowyer-wallet</code> header.
            </p>
          </Section>

          {/* ---------------- rest api ---------------- */}
          <Section id="rest" title="5 · REST API">
            <ApiRow method="GET" path="/api/agents" desc="List all businesses. Filter with ?owner=0x… for businesses launched by a wallet." />
            <ApiRow method="POST" path="/api/agents" desc="Launch a business. Body: name, tagline, category, description, revenueModel, priceUsd, payoutAddress (required if paid), ownerAddress, sources? (website/github/rss URLs), llm? ({ mode: platform, model: fast|balanced|deep } or { mode: custom, apiKey, model, baseUrl? })." />
            <ApiRow method="GET" path="/api/subscriptions?subscriber=0x…" desc="Subscriptions a wallet has bought." />
            <ApiRow method="GET" path="/api/subscriptions?creator=0x…" desc="Payments received by businesses a wallet owns." />
            <ApiRow method="POST" path="/api/subscriptions" desc="Subscribe. Body: slug, subscriber, txHash (paid only — verified on chain before activation)." />
            <ApiRow method="DELETE" path="/api/subscriptions" desc="Cancel. Body: slug, subscriber." />
            <ApiRow method="GET" path="/api/mcp/{slug}" desc="MCP server metadata and tool list for a business." />
            <p className="mt-5 text-[13px] text-subtle">
              Prefer a typed client? Download the official{" "}
              <Link href="/docs/sdk" className="text-foreground underline underline-offset-2 hover:text-accent">
                TypeScript and Python SDKs
              </Link>{" "}
              — they wrap every endpoint above.
            </p>
          </Section>

          {/* ---------------- creators ---------------- */}
          <Section id="creators" title="6 · For creators">
            <p>
              Launch from the{" "}
              <Link href="/launch" className="text-foreground underline underline-offset-2 hover:text-accent">
                Launch wizard
              </Link>{" "}
              in about two minutes. If you charge a price, you set a payout wallet — every
              subscriber payment goes to that address directly, on chain, at the moment they
              subscribe. You keep 90%; there is no invoicing, no payout schedule, no
              middleman balance.
            </p>
            <p className="mt-4">
              Your business gets a hosted MCP endpoint automatically. Subscribers&apos; tool
              calls run against the BOWYER agent runtime, and every report it generates is
              stored permanently under your business.
            </p>
            <p className="mt-4">
              Track subscribers and revenue in{" "}
              <Link href="/portfolio" className="text-foreground underline underline-offset-2 hover:text-accent">
                Portfolio → Earnings
              </Link>
              .
            </p>
          </Section>

          {/* ---------------- brain ---------------- */}
          <Section id="brain" title="7 · Brain & models">
            <p>
              Every business needs an LLM to generate reports and answer questions. At launch
              you choose one of two paths:
            </p>
            <h3 className="mt-6 text-[15px] font-semibold text-foreground">BOWYER models (free tier)</h3>
            <p className="mt-1.5">
              No API key required. Uses the platform&apos;s hosted LLM (Groq by default):
            </p>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
              <li><strong className="text-foreground">Fast</strong> — <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">llama-3.1-8b-instant</code> for alerts and short answers</li>
              <li><strong className="text-foreground">Balanced</strong> — <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">llama-3.3-70b-versatile</code> (recommended)</li>
              <li><strong className="text-foreground">Deep</strong> — same model with deeper reasoning settings for long-form reports</li>
            </ul>
            <h3 className="mt-6 text-[15px] font-semibold text-foreground">Your API key (BYOK)</h3>
            <p className="mt-1.5">
              Paste a Groq, OpenAI, OpenRouter, or custom OpenAI-compatible key. BOWYER
              verifies it at launch, stores it server-side for your business only, and never
              returns it in API responses. You pay your provider directly — BOWYER never bills
              for inference.
            </p>
            <Code>{`// Launch with your own Groq key
{
  "llm": {
    "mode": "custom",
    "apiKey": "gsk_…",
    "model": "llama-3.3-70b-versatile",
    "baseUrl": "https://api.groq.com/openai/v1"
  }
}

// Or use a BOWYER model (no key needed)
{ "llm": { "mode": "platform", "model": "balanced" } }`}</Code>
          </Section>

          {/* ---------------- knowledge ---------------- */}
          <Section id="knowledge" title="8 · Knowledge sources">
            <p>
              Connect live sources at launch. The runtime fetches them on every{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">generate_report</code>{" "}
              and{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">ask</code>{" "}
              call and injects the content into the LLM context:
            </p>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
              <li><strong className="text-foreground">Website</strong> — any public https:// URL</li>
              <li><strong className="text-foreground">GitHub</strong> — repository README via the GitHub API</li>
              <li><strong className="text-foreground">RSS</strong> — latest feed items from an RSS/Atom URL</li>
            </ul>
            <p className="mt-4">
              Up to 4 sources per business. Content is cached for 10 minutes per URL.
              Notion, X, Discord, Telegram, PDF, and Custom API are marked Coming soon in
              the Launch wizard.
            </p>
            <Code>{`{
  "sources": [
    { "type": "github", "url": "https://github.com/owner/repo" },
    { "type": "website", "url": "https://example.com/docs" },
    { "type": "rss", "url": "https://blog.example.com/feed.xml" }
  ]
}`}</Code>
          </Section>

          {/* ---------------- chain ---------------- */}
          <Section id="chain" title="9 · Chain & payments">
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-subtle">
                    <th className="py-2.5 pr-6 font-medium">Property</th>
                    <th className="py-2.5 pr-6 font-medium">Mainnet</th>
                    <th className="py-2.5 font-medium">Testnet</th>
                  </tr>
                </thead>
                <tbody className="text-muted">
                  <DocsTr a="Chain ID" b="4663" c="46630" />
                  <DocsTr a="RPC" b="rpc.mainnet.chain.robinhood.com" c="rpc.testnet.chain.robinhood.com" />
                  <DocsTr a="Explorer" b="robinhoodchain.blockscout.com" c="explorer.testnet.chain.robinhood.com" />
                  <DocsTr a="Currency" b="ETH" c="ETH (faucet.testnet.chain.robinhood.com)" />
                </tbody>
              </table>
            </div>
            <p className="mt-5">
              Payments are native ETH transfers on Robinhood Chain. Before activating a paid
              subscription, the server independently verifies on chain that the transaction
              succeeded, came from your wallet, paid the creator&apos;s payout address, and
              covered the price. A transaction hash can only be used once.
            </p>
          </Section>

          <div className="mt-16 border-t border-border pt-8">
            <p className="text-[13px] text-muted">
              Building something bigger?{" "}
              <Link href="/docs" className="text-foreground underline underline-offset-2 hover:text-accent">
                Read the Build guide
              </Link>{" "}
              — templates, architecture, and the SDK.
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}

/* ---------------- pieces ---------------- */

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-16 scroll-mt-24">
      <h2 className="border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
        {title}
      </h2>
      <div className="mt-5 text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 flex gap-4 first:mt-0">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px] text-accent">
        {n}
      </span>
      <div>
        <p className="text-[14px] font-medium text-foreground">{title}</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-4 mb-5 overflow-x-auto rounded-lg border border-border bg-surface/60 p-4 font-mono text-[12px] leading-relaxed text-muted">
      {children}
    </pre>
  );
}

function ToolRow({ name, args, desc }: { name: string; args: string; desc: string }) {
  return (
    <div className="border-b border-border py-4 first:border-t">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <code className="font-mono text-[13.5px] font-medium text-accent">{name}</code>
        <code className="font-mono text-[12px] text-subtle">{args}</code>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{desc}</p>
    </div>
  );
}

function ApiRow({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="border-b border-border py-4 first:border-t">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
          {method}
        </span>
        <code className="font-mono text-[13px] text-foreground">{path}</code>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{desc}</p>
    </div>
  );
}

function DocsTr({ a, b, c }: { a: string; b: string; c: string }) {
  return (
    <tr className="border-b border-border">
      <td className="py-2.5 pr-6 text-foreground">{a}</td>
      <td className="py-2.5 pr-6 font-mono text-[12px]">{b}</td>
      <td className="py-2.5 font-mono text-[12px]">{c}</td>
    </tr>
  );
}
