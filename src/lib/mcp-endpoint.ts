/** Shared MCP URL helper — safe for client + server imports */
export function mcpEndpointForSlug(slug: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "https://bowyer.app");
  return `${base}/api/mcp/${slug}`;
}
