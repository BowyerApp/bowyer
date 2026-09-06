import { db } from "@/lib/db";
import { ROBINHOOD_TRADING_MCP } from "@/lib/mcp";
import { createRobinhoodPkce, parseMcpResponseBody } from "@/lib/robinhood-protocol";
export { createRobinhoodPkce, parseMcpResponseBody } from "@/lib/robinhood-protocol";
import {
  disconnectRobinhoodIfRefreshToken,
  getRobinhoodConnection,
  getRobinhoodTokens,
  replaceRobinhoodTokens,
  upsertRobinhoodConnection,
} from "@/lib/robinhood-trading";

const OAUTH_METADATA_URL =
  process.env.ROBINHOOD_OAUTH_METADATA_URL ??
  "https://agent.robinhood.com/.well-known/oauth-authorization-server";
const MCP_TIMEOUT_MS = 15_000;
const REVIEW_TIMEOUT_MS = 20_000;

export interface OAuthMetadata {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
}

export interface RobinhoodOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolCallResult {
  content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc?: string;
  id?: string | number | null;
  result?: T;
  error?: { code?: number; message?: string; data?: unknown };
}

interface SessionEntry {
  id: string | null;
  initializedAt: number;
}

const sessions = new Map<string, SessionEntry>();
const refreshes = new Map<string, Promise<string>>();

function robinhoodResource(): string {
  return process.env.ROBINHOOD_MCP_URL?.trim() || ROBINHOOD_TRADING_MCP;
}

export async function getRobinhoodOAuthMetadata(): Promise<OAuthMetadata> {
  const response = await fetch(OAUTH_METADATA_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Robinhood OAuth metadata failed (${response.status})`);
  }
  const metadata = (await response.json()) as OAuthMetadata;
  if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error("Robinhood OAuth metadata is incomplete");
  }
  return metadata;
}

export async function getRobinhoodProtectedResourceMetadata(): Promise<ProtectedResourceMetadata> {
  const resource = new URL(robinhoodResource());
  const wellKnown = `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
  let response = await fetch(wellKnown, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (response.status === 404) {
    response = await fetch(`${resource.origin}/.well-known/oauth-protected-resource`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  }
  if (!response.ok) {
    throw new Error(`Robinhood protected-resource metadata failed (${response.status})`);
  }
  const metadata = (await response.json()) as ProtectedResourceMetadata;
  if (metadata.resource !== robinhoodResource()) {
    throw new Error("Robinhood OAuth protected-resource audience mismatch");
  }
  return metadata;
}

export async function getOrRegisterRobinhoodOAuthClient(
  redirectUri: string
): Promise<{
  clientId: string;
  metadata: OAuthMetadata;
  resourceMetadata: ProtectedResourceMetadata;
}> {
  const [metadata, resourceMetadata] = await Promise.all([
    getRobinhoodOAuthMetadata(),
    getRobinhoodProtectedResourceMetadata(),
  ]);
  if (
    resourceMetadata.authorization_servers?.length &&
    metadata.issuer &&
    !resourceMetadata.authorization_servers.includes(metadata.issuer)
  ) {
    throw new Error("Robinhood authorization server is not trusted by the MCP resource");
  }
  const configured = process.env.ROBINHOOD_OAUTH_CLIENT_ID?.trim();
  if (configured) return { clientId: configured, metadata, resourceMetadata };

  const cached = db()
    .prepare("SELECT client_id FROM robinhood_oauth_clients WHERE redirect_uri = ?")
    .get(redirectUri) as { client_id: string } | undefined;
  if (cached?.client_id) return { clientId: cached.client_id, metadata, resourceMetadata };
  if (!metadata.registration_endpoint) {
    throw new Error("Robinhood dynamic client registration is unavailable");
  }

  const response = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "BOWYER Robinhood Trading Agent",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.client_id !== "string") {
    throw new Error(
      typeof body.error_description === "string"
        ? body.error_description
        : `Robinhood OAuth client registration failed (${response.status})`
    );
  }
  const safeRegistrationMetadata = {
    client_id_issued_at: body.client_id_issued_at,
    client_name: body.client_name,
    redirect_uris: body.redirect_uris,
  };
  db()
    .prepare(
      `INSERT INTO robinhood_oauth_clients (redirect_uri, client_id, metadata, registered_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(redirect_uri) DO UPDATE SET
         client_id = excluded.client_id, metadata = excluded.metadata,
         registered_at = excluded.registered_at`
    )
    .run(
      redirectUri,
      body.client_id,
      JSON.stringify(safeRegistrationMetadata),
      new Date().toISOString()
    );
  return { clientId: body.client_id, metadata, resourceMetadata };
}

export async function exchangeRobinhoodAuthorizationCode(input: {
  code: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<RobinhoodOAuthTokenResponse> {
  const metadata = await getRobinhoodOAuthMetadata();
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    resource: robinhoodResource(),
  });
  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(
      typeof body.error_description === "string"
        ? body.error_description
        : `Robinhood token exchange failed (${response.status})`
    );
  }
  return body as unknown as RobinhoodOAuthTokenResponse;
}

async function performRobinhoodTokenRefresh(wallet: string): Promise<string> {
  const tokens = getRobinhoodTokens(wallet);
  if (!tokens?.refreshToken || !tokens.clientId) {
    throw new Error("Robinhood refresh credentials are unavailable; reconnect the account");
  }
  const metadata = await getRobinhoodOAuthMetadata();
  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: tokens.clientId,
      resource: robinhoodResource(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") {
    if (body.error === "invalid_grant") {
      const disconnected = disconnectRobinhoodIfRefreshToken(wallet, tokens.refreshToken);
      const latest = disconnected ? null : getRobinhoodTokens(wallet);
      if (latest) {
        return latest.accessToken;
      }
    }
    throw new Error(
      typeof body.error_description === "string"
        ? body.error_description
        : `Robinhood token refresh failed (${response.status})`
    );
  }
  const token = body as unknown as RobinhoodOAuthTokenResponse;
  replaceRobinhoodTokens({
    wallet,
    status: getRobinhoodConnection(wallet).status === "paused" ? "paused" : "linked",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? tokens.refreshToken,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : tokens.expiresAt,
    clientId: tokens.clientId,
    scope: token.scope ?? tokens.scope,
  });
  sessions.delete(wallet.toLowerCase());
  return token.access_token;
}

async function refreshRobinhoodToken(wallet: string): Promise<string> {
  const normalized = wallet.toLowerCase();
  const running = refreshes.get(normalized);
  if (running) return running;
  const next = performRobinhoodTokenRefresh(normalized).finally(() => {
    if (refreshes.get(normalized) === next) refreshes.delete(normalized);
  });
  refreshes.set(normalized, next);
  return next;
}

export function invalidateRobinhoodMcpSession(wallet: string): void {
  sessions.delete(wallet.toLowerCase());
}

async function usableAccessToken(wallet: string): Promise<string> {
  const connection = getRobinhoodConnection(wallet);
  if (connection.status !== "linked" && connection.status !== "paused") {
    throw new Error("Robinhood account is not connected");
  }
  const tokens = getRobinhoodTokens(wallet);
  if (!tokens) throw new Error("Robinhood account must be reconnected");
  if (tokens.expiresAt && tokens.expiresAt <= Date.now() + 60_000) {
    return refreshRobinhoodToken(wallet);
  }
  return tokens.accessToken;
}

async function readMcpRpcResponse<T>(
  response: Response,
  expectedId: string | number
): Promise<JsonRpcResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const rpc = parseMcpResponseBody(
      await response.text(),
      contentType,
      expectedId
    ) as JsonRpcResponse<T>;
    if (rpc.id !== expectedId) throw new Error("Robinhood MCP response ID mismatch");
    return rpc;
  }
  if (!response.body) throw new Error("Robinhood MCP returned an empty event stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = done ? "" : events.pop() ?? "";
      for (const event of events) {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n")
          .trim();
        if (!data || data === "[DONE]") continue;
        const message = JSON.parse(data) as JsonRpcResponse<T>;
        if (message.id === expectedId) {
          await reader.cancel().catch(() => {});
          return message;
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error("Robinhood MCP stream ended without the requested response");
}

async function postJsonRpc<T>(input: {
  token: string;
  sessionId?: string | null;
  method: string;
  params?: Record<string, unknown>;
  notification?: boolean;
  timeoutMs?: number;
}): Promise<{ response: JsonRpcResponse<T> | null; sessionId: string | null }> {
  const id = input.notification ? undefined : crypto.randomUUID();
  const response = await fetch(
    process.env.ROBINHOOD_MCP_URL?.trim() || ROBINHOOD_TRADING_MCP,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(input.sessionId ? { "Mcp-Session-Id": input.sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(id ? { id } : {}),
        method: input.method,
        ...(input.params ? { params: input.params } : {}),
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? MCP_TIMEOUT_MS),
    }
  );
  if (response.status === 401) {
    const error = new Error("Robinhood MCP authorization expired");
    Object.assign(error, { status: 401 });
    throw error;
  }
  const sessionId = response.headers.get("mcp-session-id") ?? input.sessionId ?? null;
  if (response.ok && (input.notification || response.status === 202)) {
    await response.body?.cancel().catch(() => {});
    return { response: null, sessionId };
  }
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(
      `Robinhood MCP ${input.method} failed (${response.status}): ${text.slice(0, 300)}`
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  if (!id) return { response: null, sessionId };
  const rpc = await readMcpRpcResponse<T>(response, id);
  if (rpc.error) {
    throw new Error(rpc.error.message || `Robinhood MCP error ${rpc.error.code ?? ""}`.trim());
  }
  return { response: rpc, sessionId };
}

async function ensureSession(wallet: string, token: string): Promise<SessionEntry> {
  const normalized = wallet.toLowerCase();
  const cached = sessions.get(normalized);
  if (cached && Date.now() - cached.initializedAt < 10 * 60_000) return cached;
  const initialized = await postJsonRpc<Record<string, unknown>>({
    token,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "bowyer-robinhood-connector", version: "1.0.0" },
    },
  });
  await postJsonRpc({
    token,
    sessionId: initialized.sessionId,
    method: "notifications/initialized",
    notification: true,
  });
  const entry = { id: initialized.sessionId, initializedAt: Date.now() };
  sessions.set(normalized, entry);
  return entry;
}

async function authenticatedRpc<T>(
  wallet: string,
  method: string,
  params?: Record<string, unknown>,
  mutation = false
): Promise<T> {
  let token = await usableAccessToken(wallet);
  try {
    const session = await ensureSession(wallet, token);
    const { response } = await postJsonRpc<T>({
      token,
      sessionId: session.id,
      method,
      params,
      timeoutMs: mutation ? REVIEW_TIMEOUT_MS : MCP_TIMEOUT_MS,
    });
    if (!response || response.result === undefined) throw new Error("Robinhood MCP returned no result");
    return response.result;
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    const invalidSession =
      status === 404 || (status === 400 && /session/i.test((error as Error).message));
    if (mutation || (status !== 401 && !invalidSession)) throw error;
    if (status === 401) token = await refreshRobinhoodToken(wallet);
    sessions.delete(wallet.toLowerCase());
    const session = await ensureSession(wallet, token);
    const { response } = await postJsonRpc<T>({
      token,
      sessionId: session.id,
      method,
      params,
    });
    if (!response || response.result === undefined) throw new Error("Robinhood MCP returned no result");
    return response.result;
  }
}

export async function listRobinhoodTools(wallet: string): Promise<McpToolDefinition[]> {
  const result = await authenticatedRpc<{ tools?: McpToolDefinition[] }>(wallet, "tools/list");
  return Array.isArray(result.tools) ? result.tools : [];
}

export async function callRobinhoodTool(
  wallet: string,
  name: string,
  args: Record<string, unknown> = {},
  options: { mutation?: boolean } = {}
): Promise<McpToolCallResult> {
  const result = await authenticatedRpc<McpToolCallResult>(
    wallet,
    "tools/call",
    { name, arguments: args },
    options.mutation === true
  );
  if (result.isError) {
    const text = result.content?.map((item) => item.text).filter(Boolean).join("\n");
    throw new Error(text || `Robinhood tool ${name} failed`);
  }
  return result;
}

export function unwrapRobinhoodToolResult(result: McpToolCallResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const texts = result.content?.map((item) => item.text).filter((text): text is string => Boolean(text)) ?? [];
  if (!texts.length) return result;
  const combined = texts.join("\n");
  try {
    return JSON.parse(combined);
  } catch {
    return combined;
  }
}

export async function callFirstAvailableRobinhoodTool(
  wallet: string,
  names: string[],
  args: Record<string, unknown> = {},
  options: { mutation?: boolean } = {}
): Promise<{ name: string; result: McpToolCallResult }> {
  const tools = await listRobinhoodTools(wallet);
  const selected = names.find((name) => tools.some((tool) => tool.name === name));
  if (!selected) throw new Error(`Robinhood does not expose a supported tool (${names.join(", ")})`);
  return { name: selected, result: await callRobinhoodTool(wallet, selected, args, options) };
}

export function findRobinhoodTool(
  tools: McpToolDefinition[],
  candidates: string[]
): McpToolDefinition | null {
  for (const candidate of candidates) {
    const exact = tools.find((tool) => tool.name === candidate);
    if (exact) return exact;
  }
  const words = candidates.flatMap((name) => name.split("_")).filter((word) => word.length > 3);
  return (
    tools.find((tool) => words.every((word) => tool.name.toLowerCase().includes(word.toLowerCase()))) ??
    null
  );
}
