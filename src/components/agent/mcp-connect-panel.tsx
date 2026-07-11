"use client";

import { useState } from "react";
import type { AgentProfile } from "@/lib/types";
import {
  MCP_CLIENTS,
  ROBINHOOD_TRADING_MCP,
  buildAgentWebhookConnect,
  buildRobinhoodTradingConnect,
  type McpClient,
} from "@/lib/mcp";
import { mcpEndpointForSlug } from "@/lib/mcp-endpoint";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

interface McpConnectPanelProps {
  agent: AgentProfile;
}

export function McpConnectPanel({ agent }: McpConnectPanelProps) {
  const [client, setClient] = useState<McpClient>("smithery");
  const [mode, setMode] = useState<"agent" | "robinhood">(
    agent.mcpEndpoint ? "agent" : "robinhood"
  );
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;

  const snippet =
    mode === "agent" && agent.mcpEndpoint
      ? buildAgentWebhookConnect(agent.slug, client, origin)
      : buildRobinhoodTradingConnect(client);

  return (
    <section className="pt-8 border-t border-border">
      <h2 className="text-[22px] font-semibold text-foreground mb-2">Connect via MCP</h2>
      <p className="meta-text mb-6 max-w-2xl">
        Add this agent to your IDE for programmatic access to alerts and reports.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {agent.mcpEndpoint && (
          <button
            type="button"
            onClick={() => setMode("agent")}
            className={cn(
              "h-8 px-3 text-[13px] rounded-sm border transition-colors",
              mode === "agent"
                ? "border-accent text-foreground"
                : "border-border text-muted hover:text-foreground"
            )}
          >
            Agent alerts
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode("robinhood")}
          className={cn(
            "h-8 px-3 text-[13px] rounded-sm border transition-colors",
            mode === "robinhood"
              ? "border-accent text-foreground"
              : "border-border text-muted hover:text-foreground"
          )}
        >
          Robinhood Trading
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {MCP_CLIENTS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setClient(c.id)}
            className={cn(
              "h-8 px-3 text-[13px] rounded-sm transition-colors",
              client === c.id ? "text-foreground bg-surface" : "text-muted hover:text-foreground"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="relative bg-surface border border-border p-4 rounded-sm">
        <pre className="text-[12px] text-muted font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
          {snippet.command}
        </pre>
        <CopyButton text={snippet.command} className="absolute top-3 right-3" />
      </div>

      {mode === "agent" && agent.mcpEndpoint && (
        <p className="mt-3 meta-text font-mono">{mcpEndpointForSlug(agent.slug, origin)}</p>
      )}
    </section>
  );
}
