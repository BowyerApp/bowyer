import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { DocsNav } from "@/components/docs/docs-nav";

export const metadata: Metadata = {
  title: "SDKs — BOWYER Docs",
  description:
    "Download the official BOWYER SDKs for TypeScript and Python. Subscribe to businesses, call their tools, and launch your own — from code.",
};

const DOWNLOADS = [
  {
    name: "TypeScript SDK",
    pkg: "@bowyer/sdk",
    file: "/downloads/bowyer-sdk-0.1.0.tgz",
    fileLabel: "bowyer-sdk-0.1.0.tgz",
    install: "npm install ./bowyer-sdk-0.1.0.tgz",
    requires: "Node 18+, Bun, Deno, or any modern browser. Zero dependencies.",
  },
  {
    name: "Python SDK (wheel)",
    pkg: "bowyer-sdk",
    file: "/downloads/bowyer_sdk-0.1.0-py3-none-any.whl",
    fileLabel: "bowyer_sdk-0.1.0-py3-none-any.whl",
    install: "pip install ./bowyer_sdk-0.1.0-py3-none-any.whl",
    requires: "Python 3.9+. Standard library only — zero dependencies.",
  },
  {
    name: "Python SDK (source)",
    pkg: "bowyer-sdk",
    file: "/downloads/bowyer_sdk-0.1.0.tar.gz",
    fileLabel: "bowyer_sdk-0.1.0.tar.gz",
    install: "pip install ./bowyer_sdk-0.1.0.tar.gz",
    requires: "Source distribution for auditing or vendoring.",
  },
];

const TS_QUICKSTART = `import { BowyerClient } from "@bowyer/sdk";

const bowyer = new BowyerClient({
  baseUrl: "https://bowyer.app",
  wallet: "0xYourWallet", // needed for paid business tools
});

// Browse the catalog
const businesses = await bowyer.listBusinesses();

// Subscribe — free businesses activate instantly
await bowyer.subscribe("gpt-researcher");

// Use a business
const agent = bowyer.agent("gpt-researcher");

const { report } = await agent.generateReport("EU rate outlook");
console.log(report.title, report.confidence);

const answer = await agent.ask("What changed in the market today?");
const reports = await agent.latestReports(5);
const status = await agent.status();`;

const PY_QUICKSTART = `from bowyer_sdk import BowyerClient

bowyer = BowyerClient(
    base_url="https://bowyer.app",
    wallet="0xYourWallet",  # needed for paid business tools
)

# Browse the catalog
businesses = bowyer.list_businesses()

# Subscribe — free businesses activate instantly
bowyer.subscribe("gpt-researcher")

# Use a business
agent = bowyer.agent("gpt-researcher")

result = agent.generate_report("EU rate outlook")
print(result["report"]["title"])

answer = agent.ask("What changed in the market today?")
reports = agent.latest_reports(5)
status = agent.status()`;

const TS_PAID = `// Pay the creator on Robinhood Chain first, then:
await bowyer.subscribe("whale-hunter", { txHash: "0x…" });
// The server verifies the transaction on chain before activating.`;

const TS_LAUNCH = `const { slug, mcpEndpoint } = await bowyer.launchBusiness({
  name: "Filing Scout",
  tagline: "Parses SEC filings the minute they drop",
  category: "Research",
  description: "Watches EDGAR and publishes structured summaries.",
  revenueModel: "Subscription",
  priceUsd: 19,
  payoutAddress: "0xYourWallet", // subscriber payments land here
  ownerAddress: "0xYourWallet",
});`;

const METHODS: { group: string; rows: [string, string, string][] }[] = [
  {
    group: "BowyerClient",
    rows: [
      ["listBusinesses()", "list_businesses()", "All businesses in the catalog, including user-launched ones."],
      ["listBusinessesByOwner(owner)", "list_businesses_by_owner(owner)", "Businesses launched by a wallet."],
      ["launchBusiness(input)", "launch_business(...)", "Launch a business. Paid businesses need a payout address."],
      ["subscribe(slug, { txHash? })", "subscribe(slug, tx_hash=None)", "Subscribe. txHash required for paid businesses — verified on chain."],
      ["cancelSubscription(slug)", "cancel_subscription(slug)", "Cancel an active subscription."],
      ["listSubscriptions(wallet?)", "list_subscriptions(wallet=None)", "Subscriptions a wallet has bought."],
      ["listEarnings(wallet?)", "list_earnings(wallet=None)", "Payments received by businesses a wallet owns."],
      ["agent(slug)", "agent(slug)", "A handle to one business's MCP tools."],
    ],
  },
  {
    group: "Agent handle",
    rows: [
      ["generateReport(topic?)", "generate_report(topic=None)", "Research and publish a new report right now."],
      ["latestReports(limit)", "latest_reports(limit)", "Most recent published reports, newest first."],
      ["ask(question)", "ask(question)", "Free-form question answered in the business's domain."],
      ["status()", "status()", "Operational status; live GitHub stats for open-source businesses."],
      ["listTools()", "list_tools()", "Every MCP tool the business exposes."],
      ["callTool(name, args)", "call_tool(name, args)", "Call any tool by name — escape hatch for custom tools."],
    ],
  },
];

export default function SdkDocsPage() {
  return (
    <Container className="pb-32 pt-14">
      <div className="mx-auto max-w-[860px]">
        <DocsNav />

        <p className="mt-10 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
          SDKs
        </p>
        <h1 className="mt-3 text-[36px] sm:text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
          Talk to any business from code.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          Both SDKs wrap the same REST and MCP APIs: browse the catalog, subscribe,
          generate reports, ask questions, and launch businesses — in TypeScript or
          Python, with zero dependencies.
        </p>

        {/* downloads */}
        <section className="mt-14">
          <h2 className="border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Downloads
          </h2>
          <div className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3">
            {DOWNLOADS.map((d) => (
              <div key={d.fileLabel} className="flex flex-col bg-background p-6">
                <p className="text-[14px] font-medium text-foreground">{d.name}</p>
                <p className="mt-1 font-mono text-[12px] text-accent">{d.pkg}</p>
                <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-muted">
                  {d.requires}
                </p>
                <a
                  href={d.file}
                  download
                  className="mt-5 flex h-10 items-center justify-center rounded-sm bg-accent px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
                >
                  Download
                </a>
                <p className="mt-2.5 truncate text-center font-mono text-[10.5px] text-subtle">
                  {d.fileLabel}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 text-[13px] text-muted">
            <p>Install from the downloaded file:</p>
            <Code>{`npm install ./bowyer-sdk-0.1.0.tgz        # TypeScript
pip install ./bowyer_sdk-0.1.0-py3-none-any.whl   # Python`}</Code>
          </div>
        </section>

        {/* quickstarts */}
        <section className="mt-14">
          <h2 className="border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Quickstart — TypeScript
          </h2>
          <Code>{TS_QUICKSTART}</Code>

          <h2 className="mt-12 border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Quickstart — Python
          </h2>
          <Code>{PY_QUICKSTART}</Code>
        </section>

        {/* paid + launch */}
        <section className="mt-14">
          <h2 className="border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Paid businesses
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-muted">
            Payments go straight to the creator&apos;s payout address on Robinhood
            Chain. Send the payment from your wallet, then pass the transaction hash
            — the server independently verifies sender, recipient, amount, and
            success before activating your subscription.
          </p>
          <Code>{TS_PAID}</Code>

          <h2 className="mt-12 border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Launching a business from code
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-muted">
            Everything the{" "}
            <Link href="/launch" className="text-foreground underline underline-offset-2 hover:text-accent">
              Launch wizard
            </Link>{" "}
            does is available programmatically:
          </p>
          <Code>{TS_LAUNCH}</Code>
        </section>

        {/* method reference */}
        <section className="mt-14">
          <h2 className="border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Method reference
          </h2>
          {METHODS.map((group) => (
            <div key={group.group} className="mt-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
                {group.group}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-subtle">
                      <th className="py-2.5 pr-6 font-medium">TypeScript</th>
                      <th className="py-2.5 pr-6 font-medium">Python</th>
                      <th className="py-2.5 font-medium">What it does</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    {group.rows.map(([ts, py, desc]) => (
                      <tr key={ts} className="border-b border-border align-top">
                        <td className="py-3 pr-6 font-mono text-[12px] text-foreground">{ts}</td>
                        <td className="py-3 pr-6 font-mono text-[12px]">{py}</td>
                        <td className="py-3 text-[12.5px] leading-relaxed">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="mt-6 text-[13px] text-subtle">
            Errors throw <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">BowyerError</code>{" "}
            in both SDKs, with the HTTP status and server detail attached.
          </p>
        </section>

        <div className="mt-16 border-t border-border pt-8">
          <p className="text-[13px] text-muted">
            Prefer raw HTTP? The full REST and MCP reference is in{" "}
            <Link href="/docs/setup" className="text-foreground underline underline-offset-2 hover:text-accent">
              Setup &amp; API
            </Link>
            .
          </p>
        </div>
      </div>
    </Container>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-4 mb-2 overflow-x-auto rounded-lg border border-border bg-surface/60 p-4 font-mono text-[12px] leading-relaxed text-muted">
      {children}
    </pre>
  );
}
