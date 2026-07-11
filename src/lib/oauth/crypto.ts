import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const raw =
    process.env.OAUTH_ENCRYPTION_KEY?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "bowyer-dev-only-change-in-production";
  return createHmac("sha256", "bowyer-oauth").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(stored: string): string | null {
  try {
    const [ivB, tagB, dataB] = stored.split(".");
    if (!ivB || !tagB || !dataB) return null;
    const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB, "base64url")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

export function signOAuthState(payload: Record<string, string>): string {
  const secret =
    process.env.OAUTH_STATE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "bowyer-oauth-state-dev";
  const body = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString("base64url");
}

export function verifyOAuthState<T extends Record<string, string>>(
  token: string,
  maxAgeMs = 15 * 60 * 1000
): T | null {
  try {
    const secret =
      process.env.OAUTH_STATE_SECRET?.trim() ||
      process.env.CRON_SECRET?.trim() ||
      "bowyer-oauth-state-dev";
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as T & {
      sig?: string;
      ts?: string;
    };
    const { sig, ts, ...rest } = parsed;
    if (!sig || !ts) return null;
    if (Date.now() - Number(ts) > maxAgeMs) return null;
    const body = JSON.stringify(rest);
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    if (sig !== expected) return null;
    return rest as T;
  } catch {
    return null;
  }
}

export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN?.trim()) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN.replace(/\/$/, "")}`;
  }
  return "http://localhost:3005";
}
