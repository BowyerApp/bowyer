/**
 * Shared MCP URL helper — safe for client + server imports. Pass an explicit
 * origin (client components should use the `useOrigin` hook) or get the
 * canonical domain; branching on `window` here caused hydration mismatches.
 */
export function mcpEndpointForSlug(slug: string, origin?: string): string {
  return `${origin ?? "https://bowyer.app"}/api/mcp/${slug}`;
}
