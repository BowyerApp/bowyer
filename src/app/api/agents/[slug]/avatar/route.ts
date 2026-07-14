import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { rateLimit } from "@/lib/rate-limit";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set([
  "robinhood-trading-agent",
  "whale-hunter",
  "hood-meme-radar",
  "gpt-researcher",
  "autogpt",
  "openhands",
]);

/** Upload a rigged GLB exported from three.ws Avatar Studio. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!ALLOWED.has(slug)) {
    return Response.json({ error: "Unknown agent slug" }, { status: 404 });
  }

  const limited = rateLimit(req, `avatar-upload:${slug}`, 3, 60 * 60 * 1000);
  if (!limited.ok) {
    return Response.json(
      { error: "Too many uploads. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 1000 || buf.length > MAX_BYTES) {
    return Response.json({ error: "GLB must be between 1KB and 8MB" }, { status: 400 });
  }

  const magic = buf.subarray(0, 4).toString("ascii");
  if (magic !== "glTF") {
    return Response.json({ error: "File must be a GLB (glTF binary)" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "models", "agents");
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${slug}.glb`);
  await writeFile(dest, buf);

  return Response.json({
    ok: true,
    url: `/models/agents/${slug}.glb?v=${Date.now()}`,
    bytes: buf.length,
  });
}
