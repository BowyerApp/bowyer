/** Open-source projects adapted into BOWYER — patterns and UI concepts. */
export const GITHUB_SOURCES = [
  {
    name: "Skill MarketPlace",
    repo: "https://github.com/dukelyuu/skills-marketplace",
    license: "MIT",
    adapted: [
      "Grid / list catalog toggle",
      "⌘K command palette search (global)",
      "Platform compatibility badges",
      "Top ranking sidebar",
      "Related items by tag overlap",
      "Version history on detail pages",
      "Scroll-to-section navigation",
    ],
  },
  {
    name: "Smithery CLI",
    repo: "https://github.com/smithery-ai/cli",
    license: "MIT",
    adapted: [
      "MCP server connect commands (`smithery mcp add`)",
      "Publish flow (`smithery mcp publish -n @org/name`)",
      "Per-platform configuration snippets",
      "Launch page URL validation before publish",
      "Tool listing on agent profiles",
    ],
  },
  {
    name: "MCP TypeScript SDK",
    repo: "https://github.com/modelcontextprotocol/typescript-sdk",
    license: "MIT",
    adapted: [
      "Streamable HTTP MCP endpoints at `/api/mcp/[slug]`",
      "JSON-RPC `tools/list` and `tools/call` handlers",
      "Whale Hunter demo tools (alerts, flow reports)",
    ],
  },
  {
    name: "cmdk",
    repo: "https://github.com/pacocoursey/cmdk",
    license: "MIT",
    adapted: [
      "Keyboard-first command palette UX",
      "Page + agent search in one overlay",
      "⌘K shortcut from any route",
    ],
  },
  {
    name: "AgentVerse",
    repo: "https://github.com/loonghao/agentverse",
    license: "MIT",
    adapted: [
      "Artifact kinds (agent, skill, workflow)",
      "Semantic versioning on listings",
      "Ratings and social proof",
      "Namespace / handle registry format",
    ],
  },
  {
    name: "mcp-remote",
    repo: "https://github.com/geelen/mcp-remote",
    license: "MIT",
    adapted: [
      "Cline stdio bridge for remote HTTP MCP servers",
      "Used in connect snippets for HTTP-only agents",
    ],
  },
] as const;

export const ROBINHOOD_DOCS = {
  chain: "https://docs.robinhood.com/chain/",
  agenticTrading: "https://robinhood.com/us/en/support/articles/agentic-trading-overview/",
  tradingWithAgent: "https://robinhood.com/us/en/support/articles/trading-with-your-agent/",
} as const;

export const FUNCTIONAL_ENDPOINTS = {
  whaleHunterMcp: "/api/mcp/whale-hunter",
  mcpValidate: "/api/mcp/validate",
} as const;
