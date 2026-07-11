import { NextResponse } from "next/server";
import { getRecentEvents } from "@/lib/data/real-stats";

export const runtime = "nodejs";

/** Recent real platform activity: published reports and new subscriptions. */
export async function GET() {
  return NextResponse.json({ events: getRecentEvents(12) });
}
