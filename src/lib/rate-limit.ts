type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Lightweight per-instance fixed-window limiter for the single-replica beta.
 * A distributed limiter is required before horizontal scaling.
 */
export function rateLimit(req: Request, scope: string, limit: number, windowMs: number): {
  ok: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }
  const key = `${scope}:${clientIp(req)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  current.count++;
  return { ok: current.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}
