import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ensureTelegramMenu, handleTelegramUpdate, telegramConfigured } from "@/lib/telegram";

export const runtime = "nodejs";

/** Telegram bot webhook — set via setWebhook to https://bowyer.app/api/telegram/webhook */
export async function POST(req: Request) {
  if (!telegramConfigured()) {
    return NextResponse.json({ ok: false, error: "Telegram not configured" }, { status: 503 });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  if (
    !secret ||
    !header ||
    header.length !== secret.length ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(secret))
  ) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const update = await req.json();
    // Telegram expects a fast acknowledgement; LLM replies may take much longer.
    void ensureTelegramMenu().catch(() => {});
    void handleTelegramUpdate(update).catch((err) => {
      console.error("Telegram update failed", err);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
