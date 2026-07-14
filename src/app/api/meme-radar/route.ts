import { NextResponse } from "next/server";
import { getMemeRadar, scanTokenRisk } from "@/lib/meme-radar";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const limit = rateLimit(req, "meme-radar", 20, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const address = new URL(req.url).searchParams.get("address")?.trim();
  try {
    if (address) return NextResponse.json({ ok: true, token: await scanTokenRisk(address) });
    return NextResponse.json({ ok: true, ...(await getMemeRadar()) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Meme radar scan failed" },
      { status: 400 }
    );
  }
}
