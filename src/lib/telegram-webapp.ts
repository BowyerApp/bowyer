import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const COOKIE_NAME = "bowyer_tg_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;

type TelegramUser = { id: number; first_name?: string; username?: string };

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readCookie(req: Request, name: string): string | null {
  const entry = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1) ?? null;
}

/** Verifies Telegram WebApp initData; never trust initDataUnsafe alone. */
export function verifyTelegramWebApp(initData: string): TelegramUser | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !initData) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const rawUser = params.get("user");
  if (!receivedHash || !authDate || !rawUser || Date.now() / 1_000 - authDate > 86_400) return null;

  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest("hex");
  if (expected.length !== receivedHash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(receivedHash))) {
    return null;
  }
  try {
    const user = JSON.parse(rawUser) as TelegramUser;
    return Number.isSafeInteger(user.id) && user.id > 0 ? user : null;
  } catch {
    return null;
  }
}

export function createTelegramWebSession(chatId: string): string {
  const token = randomBytes(32).toString("base64url");
  db().prepare("DELETE FROM telegram_web_sessions WHERE expires_at < ?").run(Date.now());
  db()
    .prepare("INSERT INTO telegram_web_sessions (token_hash, chat_id, expires_at) VALUES (?, ?, ?)")
    .run(hash(token), chatId, Date.now() + SESSION_TTL_MS);
  return token;
}

export function telegramWebSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1_000)}`;
}

export function getTelegramWebSession(req: Request): string | null {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  const row = db()
    .prepare("SELECT chat_id, expires_at FROM telegram_web_sessions WHERE token_hash = ?")
    .get(hash(token)) as { chat_id: string; expires_at: number } | undefined;
  return row && row.expires_at >= Date.now() ? row.chat_id : null;
}
