/** Robinhood + BOWYER MCP constants — adapted from smithery-ai/cli connect patterns. */
import { mcpEndpointForSlug } from "@/lib/mcp-endpoint";
export { mcpEndpointForSlug } from "@/lib/mcp-endpoint";

export const ROBINHOOD_TRADING_MCP = "https://agent.robinhood.com/mcp/trading";
export const ROBINHOOD_BANKING_MCP = "https://agent.robinhood.com/mcp/banking";

export type McpClient = "cursor" | "claude-code" | "windsurf" | "cline" | "smithery";

export interface McpConnectSnippet {
  client: McpClient;
  label: string;
  command: string;
}

export function buildRobinhoodTradingConnect(client: McpClient): McpConnectSnippet {
  const id = "robinhood-trading";
  switch (client) {
    case "smithery":
      return {
        client,
        label: "Smithery CLI",
        command: `smithery mcp add ${ROBINHOOD_TRADING_MCP} --id ${id}`,
      };
    case "cursor":
      return {
        client,
        label: "Cursor",
        command: JSON.stringify(
          {
            mcpServers: {
              [id]: { url: ROBINHOOD_TRADING_MCP },
            },
          },
          null,
          2
        ),
      };
    case "claude-code":
      return {
        client,
        label: "Claude Code",
        command: `claude mcp add --transport http ${id} ${ROBINHOOD_TRADING_MCP}`,
      };
    case "windsurf":
      return {
        client,
        label: "Windsurf",
        command: JSON.stringify(
          {
            servers: {
              [id]: { type: "http", url: ROBINHOOD_TRADING_MCP },
            },
          },
          null,
          2
        ),
      };
    case "cline":
      return {
        client,
        label: "Cline",
        command: JSON.stringify(
          {
            mcpServers: {
              [id]: {
                command: "npx",
                args: ["-y", "mcp-remote", ROBINHOOD_TRADING_MCP],
              },
            },
          },
          null,
          2
        ),
      };
  }
}

export function buildAgentWebhookConnect(
  agentSlug: string,
  client: McpClient,
  origin?: string
): McpConnectSnippet {
  const url = mcpEndpointForSlug(agentSlug, origin);
  const id = `agent-fun-${agentSlug}`;
  switch (client) {
    case "smithery":
      return {
        client,
        label: "Smithery CLI",
        command: `smithery mcp add "${url}" --id ${id}`,
      };
    case "cursor":
      return {
        client,
        label: "Cursor",
        command: JSON.stringify({ mcpServers: { [id]: { url } } }, null, 2),
      };
    case "claude-code":
      return {
        client,
        label: "Claude Code",
        command: `claude mcp add --transport http ${id} ${url}`,
      };
    case "windsurf":
      return {
        client,
        label: "Windsurf",
        command: JSON.stringify({ servers: { [id]: { type: "http", url } } }, null, 2),
      };
    case "cline":
      return {
        client,
        label: "Cline",
        command: JSON.stringify(
          {
            mcpServers: {
              [id]: { command: "npx", args: ["-y", "mcp-remote", url] },
            },
          },
          null,
          2
        ),
      };
  }
}

export const MCP_CLIENTS: { id: McpClient; label: string }[] = [
  { id: "smithery", label: "Smithery" },
  { id: "cursor", label: "Cursor" },
  { id: "claude-code", label: "Claude Code" },
  { id: "windsurf", label: "Windsurf" },
  { id: "cline", label: "Cline" },
];

export const ROBINHOOD_MCP_TOOLS = [
  "review_equity_order",
  "place_equity_order",
  "get_equity_positions",
  "get_watchlists",
  "run_scanner",
  "get_earnings_calendar",
  "get_technical_indicators",
] as const;
