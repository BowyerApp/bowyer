import { NextResponse } from "next/server";
import {
  createTelegramWebSession,
  telegramWebSessionCookie,
  verifyTelegramWebApp,
} from "@/lib/telegram-webapp";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { initData?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const user = verifyTelegramWebApp(String(body.initData ?? ""));
  if (!user) {
    return NextResponse.json({ ok: false, error: "Telegram session could not be verified" }, { status: 401 });
  }
  const token = createTelegramWebSession(String(user.id));
  const res = NextResponse.json({ ok: true, user: { id: user.id, firstName: user.first_name, username: user.username } });
  res.headers.set("Set-Cookie", telegramWebSessionCookie(token));
  return res;
}
