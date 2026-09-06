import { createHash, randomBytes } from "node:crypto";

export function createRobinhoodPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function parseMcpResponseBody(
  text: string,
  contentType = "",
  expectedId?: string | number
): unknown {
  if (contentType.includes("text/event-stream") || text.trimStart().startsWith("event:")) {
    const messages: unknown[] = [];
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
      if (!data || data === "[DONE]") continue;
      messages.push(JSON.parse(data));
    }
    if (!messages.length) throw new Error("Robinhood MCP returned an empty event stream");
    if (expectedId !== undefined) {
      const matched = messages.find(
        (message) =>
          message !== null &&
          typeof message === "object" &&
          (message as { id?: unknown }).id === expectedId
      );
      if (!matched) throw new Error("Robinhood MCP stream did not contain the requested response");
      return matched;
    }
    return messages[messages.length - 1];
  }
  return JSON.parse(text);
}

export function robinhoodReviewIsFresh(expiresAt: number | null, now = Date.now()): boolean {
  return expiresAt !== null && Number.isFinite(expiresAt) && expiresAt >= now;
}

export function deriveRobinhoodOrderNotional(
  quantity: number,
  executionPrice: number,
  reviewedTotal = 0
): number {
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(executionPrice) ||
    executionPrice <= 0 ||
    !Number.isFinite(reviewedTotal) ||
    reviewedTotal < 0
  ) {
    throw new Error("Cannot derive Robinhood order notional from invalid sizing data");
  }
  return Math.max(quantity * executionPrice, reviewedTotal);
}

export function classifyRobinhoodOrderStatus(
  status: string | null | undefined
): "filled" | "cancelled" | "failed" | null {
  if (!status) return null;
  if (/partial/i.test(status)) return null;
  if (/fill|complete|executed/i.test(status)) return "filled";
  if (/cancel|void/i.test(status)) return "cancelled";
  if (/reject|fail|expired/i.test(status)) return "failed";
  return null;
}
