import { NextResponse } from "next/server";
import { getArenaLiveData } from "@/lib/data/arena-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live Arena standings, match, and activity — sourced from the database. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    ...getArenaLiveData(),
    at: new Date().toISOString(),
  });
}
