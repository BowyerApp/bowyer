import { readBroadcastAudio } from "@/lib/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves anchor voice clips persisted in the data volume. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return new Response("Not found", { status: 404 });
  }
  const audio = readBroadcastAudio(numeric);
  if (!audio) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(audio), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
