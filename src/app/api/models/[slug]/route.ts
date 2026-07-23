import { readFile } from "fs/promises";
import { forgedModelPath } from "@/lib/agent-forge";

export const runtime = "nodejs";

/** Serve auto-forged GLBs stored on the data volume. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return Response.json({ error: "Invalid slug" }, { status: 400 });
  }
  try {
    const data = await readFile(forgedModelPath(slug));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }
}
