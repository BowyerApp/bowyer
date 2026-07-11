import { NextResponse } from "next/server";
import { getOrCreateMcpServer, handleMcpJsonRpc } from "@/lib/mcp-server";
import { GITHUB_REPOS, getAgentSummary } from "@/lib/data/agents";
import { getRegisteredDescription, hasSubscription } from "@/lib/data/agent-registry";

export const runtime = "nodejs";

function resolveServer(slug: string) {
  const agent = getAgentSummary(slug);
  if (!agent) return undefined;
  return getOrCreateMcpServer({
    slug,
    name: agent.name,
    version: agent.version,
    tagline: agent.tagline,
    description: getRegisteredDescription(slug) ?? agent.thesis,
    githubRepo: GITHUB_REPOS[slug],
  });
}

/** Streamable HTTP MCP endpoint — modelcontextprotocol/typescript-sdk pattern */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const server = resolveServer(slug);
  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    name: server.name,
    version: server.version,
    transport: "streamable-http",
    protocol: "mcp",
    tools: server.tools.map((t) => t.name),
    docs: "https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md",
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: { jsonrpc?: string; method?: string; id?: string | number; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null },
      { status: 400 }
    );
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id: body.id ?? null },
      { status: 400 }
    );
  }

  // Paid agents: tool calls require an active subscription, identified by the
  // subscriber's wallet in the x-bowyer-wallet header. Discovery methods
  // (initialize / tools/list / ping) stay open so MCP clients can connect.
  if (body.method === "tools/call") {
    const agent = getAgentSummary(slug);
    const isPaid = agent && agent.pricing.model !== "free" && agent.pricing.amount > 0;
    if (isPaid) {
      const wallet = req.headers.get("x-bowyer-wallet")?.trim() ?? "";
      if (!/^0x[0-9a-fA-F]{40}$/.test(wallet) || !hasSubscription(slug, wallet)) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32003,
              message:
                "Subscription required. Subscribe on bowyer.app, then send your wallet address in the x-bowyer-wallet header.",
            },
            id: body.id ?? null,
          },
          { status: 402 }
        );
      }
    }
  }

  const response = await handleMcpJsonRpc(resolveServer(slug), {
    jsonrpc: "2.0",
    method: body.method,
    id: body.id,
    params: body.params,
  });

  if ("error" in response && !("result" in response)) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: response.error, id: body.id ?? null },
      { status: response.error?.code === -32001 ? 404 : 400 }
    );
  }

  return NextResponse.json({ jsonrpc: "2.0", ...response });
}
