import { NextResponse } from "next/server";
import { ensureDefaultAcpOfferings, listAcpOfferings } from "@/lib/acp-offerings";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Public ACP provider catalog — Virtuals / agent clients discover hireable BOWYER businesses. */
export async function GET(req: Request) {
  const limit = rateLimit(req, "acp-offerings", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  if (url.searchParams.get("seed") === "1" || listAcpOfferings().length === 0) {
    ensureDefaultAcpOfferings();
  }
  const offerings = listAcpOfferings(url.searchParams.get("all") !== "1");
  return NextResponse.json({
    ok: true,
    protocol: "bowyer-acp-bridge",
    chainId: 4663,
    count: offerings.length,
    hire: "/api/acp/hire",
    demo: "examples/virtuals-acp/hire-bowyer-business.mjs",
    offerings,
  });
}
