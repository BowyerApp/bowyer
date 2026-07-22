import { NextResponse } from "next/server";
import { getRegistryEntry, syncAgentToRegistry } from "@/lib/business-registry";
import { getAgentSummary } from "@/lib/data/agents";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = rateLimit(req, "registry-slug", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const { slug } = await params;
  let entry = getRegistryEntry(slug);
  if (!entry && getAgentSummary(slug)) {
    entry = syncAgentToRegistry(slug);
  }
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const agent = getAgentSummary(slug);
  return NextResponse.json({
    ok: true,
    entry,
    agent: agent
      ? {
          name: agent.name,
          tagline: agent.tagline,
          version: agent.version,
          pricing: agent.pricing,
        }
      : null,
  });
}
