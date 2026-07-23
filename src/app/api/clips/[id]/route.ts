import { readFile } from "fs/promises";
import { clipAudioPath, getVoiceClip } from "@/lib/voice";

export const runtime = "nodejs";

/** Stream a shared clip's audio. ?token= is the capability from the share link. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") ?? "";
  const clipId = Number(id);
  if (!Number.isFinite(clipId) || !/^[a-f0-9]{24}$/.test(token)) {
    return Response.json({ error: "Invalid clip reference" }, { status: 400 });
  }
  const clip = getVoiceClip(clipId, token);
  if (!clip?.hasAudio) {
    return Response.json({ error: "Clip not found" }, { status: 404 });
  }
  try {
    const data = await readFile(clipAudioPath(clipId));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return Response.json({ error: "Clip audio unavailable" }, { status: 404 });
  }
}
