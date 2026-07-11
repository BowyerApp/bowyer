import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/oauth/store";

export const runtime = "nodejs";

const NOTION_VERSION = "2022-06-28";

/** List Notion pages for Launch wizard picker. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "wallet required" }, { status: 400 });
  }

  const token = getAccessToken(wallet, "notion");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Notion not connected" }, { status: 401 });
  }

  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      page_size: 30,
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "Could not fetch pages" }, { status: 502 });
  }

  const json = (await res.json()) as {
    results?: {
      id: string;
      url?: string;
      properties?: Record<string, unknown>;
    }[];
  };

  const pages = (json.results ?? []).map((p) => {
    const titleProp = Object.values(p.properties ?? {}).find(
      (v) => v && typeof v === "object" && "type" in v && (v as { type: string }).type === "title"
    ) as { title?: { plain_text?: string }[] } | undefined;
    const title =
      titleProp?.title?.map((t) => t.plain_text ?? "").join("") ||
      p.url?.replace(/^https?:\/\//, "") ||
      p.id;
    return {
      id: p.id,
      title,
      url: `notion://page/${p.id}`,
    };
  });

  return NextResponse.json({ ok: true, pages });
}
