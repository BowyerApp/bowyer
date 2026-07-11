"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";

/**
 * Post-subscribe setup: how to actually use the business you subscribed to.
 * Shows the MCP endpoint plus ready-to-paste configs for common clients.
 */

interface AccessSetupProps {
  slug: string;
  name: string;
  isPaid: boolean;
  tools: string[];
}

type ClientTab = "cursor" | "claude" | "curl";

const TABS: { id: ClientTab; label: string }[] = [
  { id: "cursor", label: "Cursor" },
  { id: "claude", label: "Claude Desktop" },
  { id: "curl", label: "cURL / any HTTP" },
];

export function AccessSetup({ slug, name, isPaid, tools }: AccessSetupProps) {
  const { address } = useWallet();
  const [tab, setTab] = useState<ClientTab>("cursor");

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://bowyer.app";
  const endpoint = `${origin}/api/mcp/${slug}`;
  const wallet = address ?? "0xYOUR_WALLET_ADDRESS";

  const snippets = useMemo<Record<ClientTab, string>>(() => {
    const headers = isPaid ? `,\n      "headers": { "x-bowyer-wallet": "${wallet}" }` : "";
    return {
      cursor: `// .cursor/mcp.json
{
  "mcpServers": {
    "${slug}": {
      "url": "${endpoint}"${headers}
    }
  }
}`,
      claude: `// claude_desktop_config.json
{
  "mcpServers": {
    "${slug}": {
      "url": "${endpoint}"${headers}
    }
  }
}`,
      curl: `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\${isPaid ? `\n  -H "x-bowyer-wallet: ${wallet}" \\` : ""}
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": { "name": "generate_report", "arguments": { "topic": "your topic" } }
  }'`,
    };
  }, [slug, endpoint, isPaid, wallet]);

  return (
    <div id="setup" className="mx-auto mt-12 max-w-2xl scroll-mt-24 text-left">
      <div className="rounded-2xl border border-border bg-surface/60 p-6 sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
          Set up access
        </p>
        <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
          Connect {name} to your tools.
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Every business on BOWYER is a live MCP server. Add it to Cursor, Claude, or any
          MCP-compatible client and its tools show up like a teammate&apos;s.
          {isPaid && (
            <>
              {" "}
              Paid tools authenticate with your subscribed wallet via the{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground">
                x-bowyer-wallet
              </code>{" "}
              header.
            </>
          )}
        </p>

        {/* endpoint */}
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-4 py-3">
          <code className="truncate font-mono text-[12.5px] text-foreground">{endpoint}</code>
          <CopyButton text={endpoint} />
        </div>

        {/* client tabs */}
        <div className="mt-6 flex gap-5 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 pb-2.5 text-[12.5px] transition-colors",
                tab === t.id
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-lg border border-border bg-background/60 p-4 font-mono text-[12px] leading-relaxed text-muted">
            {snippets[tab]}
          </pre>
          <div className="absolute right-3 top-3">
            <CopyButton text={snippets[tab]} />
          </div>
        </div>

        {/* tools */}
        <p className="mt-6 text-[12px] uppercase tracking-[0.14em] text-subtle">
          Available tools
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {tools.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-white/[0.03] px-3 py-1 font-mono text-[11.5px] text-muted"
            >
              {t}
            </span>
          ))}
        </div>

        <p className="mt-6 text-[12.5px] text-subtle">
          Full walkthrough, examples, and the REST API in the{" "}
          <Link href="/docs/setup" className="text-muted underline underline-offset-2 transition-colors hover:text-accent">
            setup docs
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Copy"
      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-subtle transition-colors hover:border-white/25 hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3.5 text-accent" strokeWidth={2} />
      ) : (
        <Copy className="size-3.5" strokeWidth={1.75} />
      )}
    </button>
  );
}
