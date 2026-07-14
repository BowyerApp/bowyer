import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAgentSummary } from "@/lib/data/agents";
import { getTelegramWebSession } from "@/lib/telegram-webapp";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const chatId = getTelegramWebSession(req);
  if (!chatId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const link = db()
    .prepare("SELECT wallet FROM telegram_links WHERE chat_id = ?")
    .get(chatId) as { wallet: string } | undefined;
  const active = db()
    .prepare("SELECT slug FROM telegram_sessions WHERE chat_id = ?")
    .get(chatId) as { slug: string } | undefined;
  const rows = db()
    .prepare("SELECT slug FROM telegram_follows WHERE chat_id = ? ORDER BY followed_at DESC")
    .all(chatId) as { slug: string }[];
  const follows = rows.flatMap(({ slug }) => {
    const agent = getAgentSummary(slug);
    return agent ? [{ slug, name: agent.name, tagline: agent.tagline, pricing: agent.pricing }] : [];
  });
  return NextResponse.json({
    ok: true,
    linked: Boolean(link),
    wallet: link?.wallet ?? null,
    activeSlug: active?.slug ?? "whale-hunter",
    follows,
  });
}
