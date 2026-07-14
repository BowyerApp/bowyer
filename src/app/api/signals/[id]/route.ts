import { NextResponse } from "next/server";
import { getSignal } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Retrieve one report-derived signal by numeric ID. */
export async function GET(_req: Request, { params }: RouteContext) {
  const { id: rawId } = await params;
  if (!/^[1-9]\d{0,14}$/.test(rawId)) {
    return NextResponse.json({ error: "signal id must be a positive integer" }, { status: 400 });
  }

  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) {
    return NextResponse.json({ error: "signal id is out of range" }, { status: 400 });
  }

  const signal = getSignal(id);
  if (!signal) {
    return NextResponse.json({ error: "signal not found" }, { status: 404 });
  }
  return NextResponse.json({ signal });
}
