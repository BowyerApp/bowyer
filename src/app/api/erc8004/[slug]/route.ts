import { NextResponse } from "next/server";
import { buildRegistrationFile } from "@/lib/erc8004";

export const runtime = "nodejs";

/** ERC-8004 agent registration file — the agentURI target for onchain identity. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const file = buildRegistrationFile(slug);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(file, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
