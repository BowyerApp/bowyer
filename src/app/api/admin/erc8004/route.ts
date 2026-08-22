import { NextResponse } from "next/server";
import {
  erc8004Enabled,
  getRegistration,
  listRegistrableSlugs,
  registerAgentOnchain,
} from "@/lib/erc8004";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Registration status for every catalog agent. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slugs = listRegistrableSlugs();
  return NextResponse.json({
    enabled: erc8004Enabled(),
    agents: slugs.map((slug) => ({ slug, registration: getRegistration(slug) })),
  });
}

/** Register all unregistered catalog agents onchain (idempotent). */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!erc8004Enabled()) {
    return NextResponse.json(
      {
        error:
          "Set ERC8004_IDENTITY_REGISTRY, ERC8004_REGISTRAR_KEY, ERC8004_RPC_URL (and optionally ERC8004_CHAIN_ID) to enable onchain registration.",
      },
      { status: 400 }
    );
  }
  const results: Record<string, unknown> = {};
  for (const slug of listRegistrableSlugs()) {
    if (getRegistration(slug)) {
      results[slug] = { ok: true, skipped: "already registered" };
      continue;
    }
    results[slug] = await registerAgentOnchain(slug);
  }
  return NextResponse.json({ results });
}
