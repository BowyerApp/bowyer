import { NextResponse } from "next/server";
import { getOrCreateMcpServer, handleMcpJsonRpc } from "@/lib/mcp-server";
import { GITHUB_REPOS, getAgentSummary } from "@/lib/data/agents";
import { getRegisteredDescription, hasSubscription } from "@/lib/data/agent-registry";
import { rateLimit } from "@/lib/rate-limit";
import { requireWalletSession } from "@/lib/wallet-auth";
import {
  buildX402Requirement,
  consumeX402Credit,
  hasUnconsumedX402Credit,
  isX402Tool,
  recordX402Payment,
  x402PriceUsdg,
} from "@/lib/x402";

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
    x402Tools: server.tools.filter((t) => isX402Tool(t.name)).map((t) => ({
      name: t.name,
      amountUsdg: x402PriceUsdg(slug, t.name),
    })),
    docs: "https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md",
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = rateLimit(req, "mcp", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32029, message: "Too many requests" }, id: null },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const { slug } = await params;

  let body: {
    jsonrpc?: string;
    method?: string;
    id?: string | number;
    params?: Record<string, unknown>;
  };
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

  const toolName =
    body.method === "tools/call" ? String(body.params?.name ?? "") : "";
  const isStatusCall = body.method === "tools/call" && toolName === "get_status";
  const needsAccessCheck =
    (body.method === "tools/call" && !isStatusCall) || body.method === "resources/read";

  if (needsAccessCheck) {
    const agent = getAgentSummary(slug);
    const isPaid = agent && agent.pricing.model !== "free" && agent.pricing.amount > 0;
    const wallet = requireWalletSession(req);
    const subscribed = wallet ? hasSubscription(slug, wallet) : false;

    // Paid monthly subscription path (existing).
    if (isPaid && subscribed) {
      /* allowed */
    } else if (wallet && isX402Tool(toolName)) {
      // x402 pay-per-call: accept prior credit or inline payment tx.
      const paymentTx =
        req.headers.get("x-payment-tx")?.trim() ||
        req.headers.get("x-bowyer-payment-tx")?.trim();

      if (paymentTx) {
        const recorded = await recordX402Payment({
          slug,
          tool: toolName,
          payer: wallet,
          txHash: paymentTx,
          amountUsdg: x402PriceUsdg(slug, toolName),
        });
        if (!recorded.ok) {
          const requirement = buildX402Requirement(slug, toolName);
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              error: {
                code: -32003,
                message: recorded.reason ?? "x402 payment rejected",
                data: { x402: requirement },
              },
              id: body.id ?? null,
            },
            {
              status: 402,
              headers: requirement
                ? {
                    "X-Payment-Required": "true",
                    "PAYMENT-REQUIRED": JSON.stringify(requirement),
                  }
                : undefined,
            }
          );
        }
      }

      if (hasUnconsumedX402Credit(slug, wallet, toolName)) {
        consumeX402Credit(slug, wallet, toolName);
      } else if (isPaid) {
        const requirement = buildX402Requirement(slug, toolName);
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32003,
              message:
                "Subscription or x402 USDG payment required. Subscribe on bowyer.app or POST /api/x402 with a USDG transfer tx hash.",
              data: { x402: requirement },
            },
            id: body.id ?? null,
          },
          {
            status: 402,
            headers: requirement
              ? {
                  "X-Payment-Required": "true",
                  "PAYMENT-REQUIRED": JSON.stringify(requirement),
                }
              : undefined,
          }
        );
      }
      // Free agents: still allow without payment (legacy open tools), but x402
      // credits work when presented for ACP-style callers.
    } else if (isPaid) {
      const requirement = buildX402Requirement(slug, toolName);
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32003,
            message:
              "Subscription and signed BOWYER wallet session required — or pay per call in USDG (x402).",
            data: { x402: requirement },
          },
          id: body.id ?? null,
        },
        {
          status: 402,
          headers: requirement
            ? {
                "X-Payment-Required": "true",
                "PAYMENT-REQUIRED": JSON.stringify(requirement),
              }
            : undefined,
        }
      );
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
