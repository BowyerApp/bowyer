import { NextResponse } from "next/server";
import { getOrCreateMcpServer } from "@/lib/mcp-server";
import { getAgentSummary } from "@/lib/data/agents";
import { mcpEndpointForSlug } from "@/lib/mcp-endpoint";
import { isSafePublicHttpUrl } from "@/lib/knowledge-sources";
import { rateLimit } from "@/lib/rate-limit";
import { requireWalletSession } from "@/lib/wallet-auth";

export const runtime = "nodejs";

/** Validate MCP URLs before publish — Smithery CLI publish flow pre-check */
export async function POST(req: Request) {
  const limit = rateLimit(req, "mcp-validate", 10, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  if (!requireWalletSession(req)) {
    return NextResponse.json({ ok: false, error: "Wallet session required" }, { status: 401 });
  }
  let url: string;
  try {
    const body = await req.json();
    url = String(body.url ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json({ ok: false, error: "URL is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid URL format" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ ok: false, error: "URL must use HTTP or HTTPS" }, { status: 400 });
  }
  if (!(await isSafePublicHttpUrl(url))) {
    return NextResponse.json({ ok: false, error: "URL must resolve to a public HTTP(S) address" }, { status: 400 });
  }

  // Local BOWYER MCP endpoints resolve instantly
  const localMatch = parsed.pathname.match(/\/api\/mcp\/([a-z0-9-]+)$/);
  if (localMatch) {
    const slug = localMatch[1];
    const agent = getAgentSummary(slug);
    const server = agent
      ? getOrCreateMcpServer({ slug, name: agent.name, version: agent.version, tagline: agent.tagline })
      : undefined;
    if (server) {
      return NextResponse.json({
        ok: true,
        reachable: true,
        tools: server.tools.length,
        transport: "streamable-http",
        message: `BOWYER MCP server "${slug}" is live with ${server.tools.length} tools.`,
      });
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    let tools = 0;
    let transport: string | undefined;
    if (res.ok) {
      try {
        const meta = await res.json();
        if (Array.isArray(meta.tools)) tools = meta.tools.length;
        if (meta.transport) transport = meta.transport;
      } catch {
        // GET may not return JSON on third-party servers
      }
    }

    return NextResponse.json({
      ok: true,
      reachable: res.ok,
      status: res.status,
      tools,
      transport,
      message: res.ok
        ? `Endpoint reachable (${res.status}). Ready for smithery mcp publish.`
        : `Endpoint returned HTTP ${res.status}. Check your MCP server is running.`,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      reachable: false,
      error: err instanceof Error ? err.message : "Could not reach endpoint",
      hint: `Try a local BOWYER endpoint: ${mcpEndpointForSlug("whale-hunter", "http://localhost:3005")}`,
    });
  }
}
