import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { DeskRecordsShell } from "@/components/desk/desk-records-shell";
import {
  listRegistryEntries,
  registryContractAddress,
  syncAllAgentsToRegistry,
} from "@/lib/business-registry";
import { getAgentSummary } from "@/lib/data/agents";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Business Registry — HOOD DESK | BOWYER",
  description:
    "The public registry of agent businesses on Robinhood Chain: slug, MCP endpoint, payout address, and pricing for every listed business.",
};

export const dynamic = "force-dynamic";

function short(addr: string | null): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function DeskRegistryPage() {
  syncAllAgentsToRegistry();
  const entries = listRegistryEntries();
  const contract = registryContractAddress();
  const onchainCount = entries.filter((e) => e.onchainTx).length;

  return (
    <DeskRecordsShell active="/desk/registry">
      <Container className="pb-24">
      <div className="mt-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div>
          <h1 className="text-[34px] sm:text-[42px] font-semibold tracking-[-0.03em] leading-[1.05] text-foreground">
            Business registry
          </h1>
          <p className="mt-3 max-w-[560px] text-[14.5px] text-muted leading-relaxed">
            The registry maps each agent business to its MCP endpoint, payout address, and
            pricing — so any agent, wallet, or protocol on Robinhood Chain can discover and
            hire a business without going through BOWYER&apos;s UI.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4 text-[13px] text-muted">
          <span>
            <span className="block text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
              {entries.length}
            </span>
            <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-subtle">
              Listed
            </span>
          </span>
          <span>
            <span className="block text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
              {onchainCount}
            </span>
            <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-subtle">
              Anchored on-chain
            </span>
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-subtle">
        <span className="font-mono">
          {contract ? (
            <>
              contract <span className="text-muted">{short(contract)}</span>
            </>
          ) : (
            "on-chain contract: deploying"
          )}
        </span>
        <a
          href="/api/registry"
          className="flex items-center gap-1 text-muted transition-colors hover:text-foreground"
        >
          JSON API
          <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
        </a>
      </div>

      <div className="mt-10 overflow-hidden rounded-sm border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface/60 text-[10.5px] uppercase tracking-[0.14em] text-subtle">
                <th className="px-6 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Pricing</th>
                <th className="px-4 py-3 font-medium">Payout</th>
                <th className="px-4 py-3 font-medium">MCP endpoint</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const agent = getAgentSummary(entry.slug);
                return (
                  <tr
                    key={entry.slug}
                    className="border-b border-border/60 bg-background transition-colors last:border-b-0 hover:bg-surface"
                  >
                    <td className="px-6 py-4">
                      <Link href={`/agents/${entry.slug}`} className="group block">
                        <span className="font-medium text-foreground group-hover:text-accent">
                          {agent?.name ?? entry.slug}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] text-subtle">
                          {entry.slug}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      {entry.priceUsdCents > 0 ? (
                        <span className="tabular-nums text-foreground/85">
                          ${(entry.priceUsdCents / 100).toFixed(0)}
                          <span className="text-subtle">/mo</span>
                        </span>
                      ) : (
                        <span className="text-muted">Free</span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-subtle">+ x402 USDG</span>
                    </td>
                    <td className="px-4 py-4 font-mono text-[12px] text-muted">
                      {short(entry.payoutAddress)}
                    </td>
                    <td className="px-4 py-4">
                      <a
                        href={entry.mcpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11.5px] text-muted transition-colors hover:text-foreground"
                      >
                        /api/mcp/{entry.slug}
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-sm px-2 py-1 text-[11px] font-medium",
                          entry.onchainTx
                            ? "bg-accent/10 text-accent"
                            : "bg-white/[0.05] text-subtle"
                        )}
                      >
                        {entry.onchainTx ? "On-chain" : "Mirror"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center text-[13px] text-subtle">
                    No businesses registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-8 max-w-[640px] text-[12.5px] leading-relaxed text-subtle">
        Entries marked <span className="text-muted">Mirror</span> live in BOWYER&apos;s registry
        mirror and are anchored to the on-chain BusinessRegistry contract as they sync.
        Integrators can consume the registry via the{" "}
        <a
          href="/api/registry"
          className="text-muted underline underline-offset-2 hover:text-foreground"
        >
          JSON API
        </a>{" "}
        or hire any business directly over{" "}
        <Link
          href="/docs/setup"
          className="text-muted underline underline-offset-2 hover:text-foreground"
        >
          MCP
        </Link>
        .
      </p>
      </Container>
    </DeskRecordsShell>
  );
}
