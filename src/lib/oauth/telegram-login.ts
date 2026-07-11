import { createHmac } from "node:crypto";

/**
 * Verify Telegram Login Widget payload.
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramLogin(data: Record<string, string>): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;

  const { hash, ...fields } = data;
  if (!hash) return false;

  const authDate = Number(fields.auth_date);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return false;

  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const computed = createHmac("sha256", secretKey).update(checkString).digest("hex");

  return computed === hash;
}
