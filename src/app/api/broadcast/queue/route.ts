import { NextResponse } from "next/server";
import { listBroadcastItems, synthesizeNextPending } from "@/lib/broadcast";
import { voiceConfigured } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Broadcast event queue.
 * - The floor page polls `?since=<id>` to drive camera cuts + lower-thirds.
 * - The streamer polls with `&synth=1`, which voices at most one pending
 *   item per call (TTS cost only accrues while something is actually
 *   consuming the stream).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = Math.max(Number(url.searchParams.get("since")) || 0, 0);
  const synth = url.searchParams.get("synth") === "1";

  if (synth && voiceConfigured()) {
    await synthesizeNextPending().catch(() => null);
  }

  const items = listBroadcastItems(since, 20).map((item) => ({
    ...item,
    audioUrl: item.hasAudio ? `/api/broadcast/audio/${item.id}` : null,
  }));

  return NextResponse.json({ ok: true, items });
}
