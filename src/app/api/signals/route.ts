import { NextResponse } from "next/server";
import { listSignals } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const MAX_SLUG_LENGTH = 100;

function parseLimit(value: string | null): number | null {
  if (value === null) return 20;
  if (!/^\d{1,3}$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

/** List the newest report-derived signals, optionally for a single agent. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const requestedSlug = searchParams.get("slug");
  const slug = requestedSlug?.trim();

  if (limit === null) {
    return NextResponse.json(
      { error: `limit must be an integer between 1 and ${MAX_LIMIT}` },
      { status: 400 }
    );
  }
  if (requestedSlug !== null && (!slug || slug.length > MAX_SLUG_LENGTH)) {
    return NextResponse.json(
      { error: `slug must be between 1 and ${MAX_SLUG_LENGTH} characters` },
      { status: 400 }
    );
  }

  return NextResponse.json({ signals: listSignals({ slug, limit }) });
}
