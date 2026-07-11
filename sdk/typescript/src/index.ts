/**
 * BOWYER SDK — TypeScript client for the BOWYER platform.
 *
 * Works in Node 18+, Bun, Deno, and browsers (uses global fetch).
 *
 * ```ts
 * import { BowyerClient } from "@bowyer/sdk";
 *
 * const bowyer = new BowyerClient({ wallet: "0xYourWallet" });
 * const agents = await bowyer.listBusinesses();
 * const report = await bowyer.agent("whale-hunter").generateReport("NVDA flows");
 * ```
 */

export interface BowyerClientOptions {
  /** Base URL of the BOWYER deployment. Defaults to https://bowyer.app */
  baseUrl?: string;
  /** Your wallet address — required to call paid business tools. */
  wallet?: string;
  /** Custom fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
}

export interface Business {
  slug: string;
  name: string;
  tagline: string;
  pricing: { model: string; amount: number; currency: string; period?: string };
  status: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface Subscription {
  slug: string;
  subscriber: string;
  txHash?: string;
  amountUsd: number;
  at: string;
}

export interface Report {
  id: number;
  slug: string;
  title: string;
  body: string;
  confidence: number | null;
  createdAt: string;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: unknown;
}

export class BowyerError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly detail?: unknown
  ) {
    super(message);
    this.name = "BowyerError";
  }
}

interface JsonRpcResponse {
  result?: { content?: { type: string; text: string }[] };
  error?: { code: number; message: string };
}

export class BowyerClient {
  readonly baseUrl: string;
  readonly wallet?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BowyerClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://bowyer.app").replace(/\/$/, "");
    this.wallet = options.wallet;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /* ---------------- REST ---------------- */

  private async rest<T>(
    path: string,
    init?: { method?: string; body?: unknown }
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new BowyerError(
        String(data.error ?? `Request failed: HTTP ${res.status}`),
        res.status,
        data
      );
    }
    return data as T;
  }

  /** All businesses in the catalog (including user-launched ones). */
  async listBusinesses(): Promise<Business[]> {
    const data = await this.rest<{ agents: Business[] }>("/api/agents");
    return data.agents;
  }

  /** Businesses launched by a wallet. */
  async listBusinessesByOwner(owner: string): Promise<Business[]> {
    const data = await this.rest<{ agents: Business[] }>(
      `/api/agents?owner=${encodeURIComponent(owner)}`
    );
    return data.agents;
  }

  /**
   * Launch a business. For paid businesses, include payoutAddress — subscriber
   * payments go directly to that wallet.
   */
  async launchBusiness(input: {
    name: string;
    tagline: string;
    category: string;
    description: string;
    revenueModel: "Free" | "Subscription" | "One-time license";
    priceUsd: number;
    payoutAddress?: string;
    ownerAddress?: string;
    mcpEndpoint?: string;
  }): Promise<{ slug: string; url: string; mcpEndpoint: string }> {
    return this.rest("/api/agents", {
      method: "POST",
      body: { ...input, creatorSharePct: 90 },
    });
  }

  /** Subscriptions bought by a wallet (defaults to the client wallet). */
  async listSubscriptions(subscriber?: string): Promise<Subscription[]> {
    const who = subscriber ?? this.wallet;
    if (!who) throw new BowyerError("A subscriber wallet address is required");
    const data = await this.rest<{ subscriptions: Subscription[] }>(
      `/api/subscriptions?subscriber=${encodeURIComponent(who)}`
    );
    return data.subscriptions;
  }

  /** Payments received by businesses a wallet owns. */
  async listEarnings(creator?: string): Promise<Subscription[]> {
    const who = creator ?? this.wallet;
    if (!who) throw new BowyerError("A creator wallet address is required");
    const data = await this.rest<{ subscriptions: Subscription[] }>(
      `/api/subscriptions?creator=${encodeURIComponent(who)}`
    );
    return data.subscriptions;
  }

  /**
   * Subscribe to a business. Free businesses activate instantly. Paid
   * businesses require txHash — the hash of your on-chain payment to the
   * creator's payout address (it is verified server-side).
   */
  async subscribe(slug: string, options: { txHash?: string } = {}): Promise<{
    ok: boolean;
    payoutAddress?: string | null;
    alreadySubscribed?: boolean;
  }> {
    if (!this.wallet) throw new BowyerError("Set `wallet` in BowyerClient options to subscribe");
    return this.rest("/api/subscriptions", {
      method: "POST",
      body: { slug, subscriber: this.wallet, txHash: options.txHash },
    });
  }

  /** Cancel an active subscription. */
  async cancelSubscription(slug: string): Promise<{ ok: boolean }> {
    if (!this.wallet) throw new BowyerError("Set `wallet` in BowyerClient options to cancel");
    return this.rest("/api/subscriptions", {
      method: "DELETE",
      body: { slug, subscriber: this.wallet },
    });
  }

  /* ---------------- MCP ---------------- */

  /** A handle to one business's MCP tools. */
  agent(slug: string): BowyerAgent {
    return new BowyerAgent(this, slug);
  }
}

export class BowyerAgent {
  constructor(
    private readonly client: BowyerClient,
    readonly slug: string
  ) {}

  private get endpoint(): string {
    return `${this.client.baseUrl}/api/mcp/${this.slug}`;
  }

  private async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.client.wallet) headers["x-bowyer-wallet"] = this.client.wallet;

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json()) as JsonRpcResponse;
    if (json.error) throw new BowyerError(json.error.message, res.status, json.error);

    const text = json.result?.content?.[0]?.text;
    if (text === undefined) return json.result;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** List the tools this business exposes. */
  async listTools(): Promise<McpToolInfo[]> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const json = (await res.json()) as { result?: { tools?: McpToolInfo[] } };
    return json.result?.tools ?? [];
  }

  /** Call any tool by name. */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.rpc("tools/call", { name, arguments: args });
  }

  /** Ask the business to research and publish a new report right now. */
  async generateReport(topic?: string): Promise<{ agent: string; report: Report }> {
    return (await this.callTool("generate_report", topic ? { topic } : {})) as {
      agent: string;
      report: Report;
    };
  }

  /** The business's most recent published reports. */
  async latestReports(limit = 5): Promise<Report[]> {
    const data = (await this.callTool("get_latest_reports", { limit })) as {
      reports: Report[];
    };
    return data.reports;
  }

  /** Ask a free-form question in the business's domain. */
  async ask(question: string): Promise<string> {
    const data = (await this.callTool("ask", { question })) as { answer: string };
    return data.answer;
  }

  /** Operational status, including live GitHub stats for open-source businesses. */
  async status(): Promise<Record<string, unknown>> {
    return (await this.callTool("get_status")) as Record<string, unknown>;
  }
}
