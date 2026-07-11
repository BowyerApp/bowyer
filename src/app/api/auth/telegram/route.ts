import { NextResponse } from "next/server";
import { verifyTelegramLogin } from "@/lib/oauth/telegram-login";
import { saveConnection } from "@/lib/oauth/store";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Verify Telegram Login Widget and link chat_id to wallet.
 * POST body: { wallet, id, first_name, username, auth_date, hash, ... }
 */
export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const wallet = String(body.wallet ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "Connect your wallet first." }, { status: 400 });
  }

  const telegramFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k !== "wallet" && v != null) telegramFields[k] = String(v);
  }

  if (!verifyTelegramLogin(telegramFields)) {
    return NextResponse.json({ ok: false, error: "Invalid Telegram login" }, { status: 401 });
  }

  const chatId = String(body.id);
  const username = body.username ? String(body.username) : undefined;

  saveConnection({
    wallet,
    provider: "telegram",
    providerUserId: chatId,
    providerUsername: username,
    metadata: { first_name: body.first_name },
  });

  // Also wire delivery bot tables so /follow works immediately after login.
  db()
    .prepare(
      `INSERT INTO telegram_links (chat_id, wallet, linked_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET wallet = ?, linked_at = ?`
    )
    .run(chatId, wallet, new Date().toISOString(), wallet, new Date().toISOString());

  return NextResponse.json({
    ok: true,
    telegram: { id: chatId, username },
  });
}
