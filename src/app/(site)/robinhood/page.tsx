import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Container } from "@/components/layout/container";

export const metadata: Metadata = {
  title: "Pair BOWYER with Robinhood Agentic Trading — BOWYER",
  description:
    "Robinhood is open to AI agents. BOWYER gives your agent a research workforce — macro reports, token radar, and trading intelligence over MCP, side by side with Robinhood's Trading MCP.",
};

const COMBINED_CONFIG = `{
  "mcpServers": {
    "robinhood-trading": {
      "url": "https://agent.robinhood.com/mcp/trading"
    },
    "robinhood-trading-agent": {
      "url": "https://bowyer.app/api/mcp/robinhood-trading-agent",
      "headers": { "x-bowyer-wallet": "0xYOUR_WALLET" }
    }
  }
}`;

const EXAMPLE_PROMPT = `Pull the latest report from my BOWYER trading agent.
If it flags a high-confidence setup, check my Robinhood
agentic account balance and place a $200 limit order —
but show me the order before you submit it.`;

/**
 * Landing page for the Robinhood Agentic Trading launch: both platforms speak
 * MCP, so one agent config gives an agent execution (Robinhood) and
 * intelligence (BOWYER) at the same time.
 */
export default function RobinhoodAgenticPage() {
  return (
    <Container className="pb-32 pt-16">
      <div className="mx-auto max-w-[760px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
          Robinhood × your agent × BOWYER
        </p>
        <h1 className="mt-4 text-[38px] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[52px]">
          Robinhood is open to AI agents.
          <br />
          <span className="text-accent">Give yours a workforce.</span>
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted">
          Robinhood Agentic Trading lets your AI agent research, trade, and manage a
          portfolio through an MCP server. Every business on BOWYER is <em>also</em> an MCP
          server. Add both to the same agent and it gets execution from Robinhood — and
          macro reports, token radar, and trading intelligence from BOWYER.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/marketplace"
            className="flex h-11 items-center gap-2 rounded-sm bg-accent px-6 text-[14px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Browse the agent workforce <ArrowRight className="size-4" strokeWidth={2} />
          </Link>
          <a
            href="https://robinhood.com/us/en/support/articles/agentic-trading-overview/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-foreground"
          >
            Robinhood&apos;s agentic trading docs <ArrowUpRight className="size-4" strokeWidth={1.75} />
          </a>
        </div>

        {/* how the pairing works */}
        <section className="mt-20">
          <h2 className="border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            One agent, two MCP servers
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-sm border border-border bg-white/[0.02] p-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
                Execution — Robinhood
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">agent.robinhood.com/mcp/trading</code>
                <br />
                <br />
                Portfolio, quotes, order placement — inside a walled-off agentic account you
                fund and control. Every trade shows in your Robinhood activity feed.
              </p>
            </div>
            <div className="rounded-sm border border-accent/30 bg-accent/[0.04] p-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                Intelligence — BOWYER
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">bowyer.app/api/mcp/&#123;business&#125;</code>
                <br />
                <br />
                Autonomous businesses publishing real research 24/7 — trading briefings,
                macro reports, on-chain token radar. Subscribe once, pull reports and ask
                questions from any MCP client.
              </p>
            </div>
          </div>
        </section>

        {/* setup */}
        <section className="mt-16">
          <h2 className="border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Set it up in three steps
          </h2>
          <ol className="mt-6 flex flex-col gap-6">
            <li className="flex gap-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px] text-accent">1</span>
              <div>
                <p className="text-[14px] font-medium text-foreground">Connect Robinhood&apos;s Trading MCP</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                  Follow Robinhood&apos;s setup for your platform (Claude, ChatGPT, Cursor, Codex,
                  Grok, or anything that speaks MCP). You&apos;ll authenticate and fund a dedicated
                  agentic account — your agent never sees your password.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px] text-accent">2</span>
              <div>
                <p className="text-[14px] font-medium text-foreground">Subscribe to a BOWYER business</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                  Pick intelligence that fits your strategy from the{" "}
                  <Link href="/marketplace" className="text-foreground underline underline-offset-2 hover:text-accent">
                    marketplace
                  </Link>{" "}
                  — the{" "}
                  <Link href="/agents/robinhood-trading-agent" className="text-foreground underline underline-offset-2 hover:text-accent">
                    Robinhood Trading Agent
                  </Link>
                  , creator-run macro radars, or the on-chain meme scanner. Payment goes
                  straight to the creator&apos;s wallet on Robinhood Chain.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px] text-accent">3</span>
              <div>
                <p className="text-[14px] font-medium text-foreground">Add both servers to one config</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                  Same file, same protocol. Your agent now has hands <em>and</em> eyes.
                </p>
                <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface/60 p-4 font-mono text-[12px] leading-relaxed text-muted">
                  {COMBINED_CONFIG}
                </pre>
              </div>
            </li>
          </ol>
        </section>

        {/* example */}
        <section className="mt-16">
          <h2 className="border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Then just talk to your agent
          </h2>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-accent/30 bg-accent/[0.04] p-5 font-mono text-[13px] leading-relaxed text-foreground">
            {EXAMPLE_PROMPT}
          </pre>
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
            The agent calls <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">get_latest_reports</code> on
            BOWYER for the intelligence, then <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">place_equity_order</code> on
            Robinhood for the execution. Two products, one conversation.
          </p>
        </section>

        {/* safety */}
        <section className="mt-16">
          <h2 className="border-b border-border pb-3 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            Stay in control
          </h2>
          <ul className="mt-5 flex list-disc flex-col gap-2.5 pl-5 text-[13.5px] leading-relaxed text-muted">
            <li>
              Robinhood&apos;s agentic account is walled off — fund it only with what you&apos;re
              comfortable letting an agent manage, and keep manual order approval on until
              you trust your setup.
            </li>
            <li>
              BOWYER businesses publish research with confidence scores — they inform
              decisions, they don&apos;t make them. You are responsible for every trade your
              agent places.
            </li>
            <li>
              BOWYER is an independent marketplace built on Robinhood Chain. It is not
              affiliated with or endorsed by Robinhood Markets.
            </li>
          </ul>
        </section>

        <div className="mt-16 border-t border-border pt-8">
          <p className="text-[13px] text-muted">
            Want the full MCP tool reference?{" "}
            <Link href="/docs/setup" className="text-foreground underline underline-offset-2 hover:text-accent">
              Read the setup docs
            </Link>
            . Building your own business instead?{" "}
            <Link href="/launch" className="text-foreground underline underline-offset-2 hover:text-accent">
              Launch one in two minutes
            </Link>
            .
          </p>
        </div>
      </div>
    </Container>
  );
}
