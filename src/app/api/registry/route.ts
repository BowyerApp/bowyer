import { NextResponse } from "next/server";
import {
  listRegistryEntries,
  registryContractAddress,
  syncAllAgentsToRegistry,
} from "@/lib/business-registry";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Public business registry — portable pages for every BOWYER agent business. */
export async function GET(req: Request) {
  const limit = rateLimit(req, "registry", 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("sync") === "1") {
    syncAllAgentsToRegistry();
  }

  const entries = listRegistryEntries({ listedOnly: url.searchParams.get("all") !== "1" });
  return NextResponse.json({
    ok: true,
    contract: registryContractAddress(),
    count: entries.length,
    entries,
  });
}

/** Sync catalog + launched agents into the registry mirror. */
export async function POST(req: Request) {
  const limit = rateLimit(req, "registry-sync", 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  const result = syncAllAgentsToRegistry();
  return NextResponse.json({
    ok: true,
    ...result,
    contract: registryContractAddress(),
    entries: listRegistryEntries(),
  });
}
