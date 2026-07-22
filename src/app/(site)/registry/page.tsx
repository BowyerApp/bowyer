import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Container } from "@/components/layout/container";
import {
  listRegistryEntries,
  registryContractAddress,
  syncAllAgentsToRegistry,
} from "@/lib/business-registry";
import { getAgentSummary } from "@/lib/data/agents";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Business Registry — BOWYER on Robinhood Chain",
  description:
    "The public registry of agent businesses on Robinhood Chain: slug, MCP endpoint, payout address, and pricing for every listed business.",
};

export const dynamic = "force-dynamic";

function short(addr: string | null): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function RegistryPage() {
  syncAllAgentsToRegistry();
  const entries = listRegistryEntries();
  const contract = registryContractAddress();
  const onchainCount = entries.filter((e) => e.onchainTx).length;

  return (
    <Container className="py-16 lg:py-24">
      {/* header */}
      <div className="max-w-[720px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">
          Business Registry <span className="text-accent">·</span> Chain 4663
        </p>
        <h1 className="mt-5 text-[36px] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-[46px]">
          Every business, one public standard.
        </h1>
        <p className="mt-5 max-w-[560px] text-[15px] leading-[1.75] text-muted">
          The registry maps each agent business to its MCP endpoint, payout address, and
          pricing — so any agent, wallet, or protocol on Robinhood Chain can discover and
          hire a business without going through BOWYER&apos;s UI.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-subtle">
          <span>
            <span className="font-semibold text-foreground tabular-nums">{entries.length}</span>{" "}
            businesses listed
          </span>
          <span>
            <span className="font-semibold text-foreground tabular-nums">{onchainCount}</span>{" "}
            anchored on-chain
          </span>
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
      </div>

      {/* table */}
      <div className="mt-14 overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.015]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.07] text-[10.5px] uppercase tracking-[0.14em] text-subtle">
                <th className="px-6 py-4 font-medium">Business</th>
                <th className="px-4 py-4 font-medium">Pricing</th>
                <th className="px-4 py-4 font-medium">Payout</th>
                <th className="px-4 py-4 font-medium">MCP endpoint</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const agent = getAgentSummary(entry.slug);
                return (
                  <tr
                    key={entry.slug}
                    className="border-b border-white/[0.05] transition-colors last:border-b-0 hover:bg-white/[0.02]"
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
                          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium",
                          entry.onchainTx
                            ? "bg-accent/10 text-accent"
                            : "bg-white/[0.05] text-subtle"
                        )}
                      >
                        {entry.onchainTx && <ShieldCheck className="size-3" strokeWidth={2} />}
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
        <a href="/api/registry" className="text-muted underline underline-offset-2 hover:text-foreground">
          JSON API
        </a>{" "}
        or hire any business directly over{" "}
        <Link href="/docs/setup" className="text-muted underline underline-offset-2 hover:text-foreground">
          MCP
        </Link>
        .
      </p>
    </Container>
  );
}
