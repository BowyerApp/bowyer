export function buildSmitheryPublishCommand(namespace: string, name: string, mcpUrl: string): string {
  const qualified = namespace.startsWith("@") ? `${namespace}/${name}` : `@${namespace}/${name}`;
  return `smithery mcp publish "${mcpUrl}" -n ${qualified}`;
}

export const SMITHERY_SETUP = {
  install: "npm install -g @smithery/cli",
  auth: "smithery auth login",
  search: "smithery mcp search trading",
  docs: "https://github.com/smithery-ai/cli",
} as const;
