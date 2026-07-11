import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/oauth/store";

export const runtime = "nodejs";

/** X accounts the user can add as a knowledge source (self + optional handles). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "wallet required" }, { status: 400 });
  }

  const token = getAccessToken(wallet, "x");
  if (!token) {
    return NextResponse.json({ ok: false, error: "X not connected" }, { status: 401 });
  }

  const res = await fetch("https://api.twitter.com/2/users/me?user.fields=username,name", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "Could not fetch profile" }, { status: 502 });
  }

  const json = (await res.json()) as {
    data?: { id: string; username: string; name?: string };
  };
  if (!json.data) {
    return NextResponse.json({ ok: false, error: "No profile" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    accounts: [
      {
        id: json.data.id,
        username: json.data.username,
        name: json.data.name ?? json.data.username,
        url: `x://user/${json.data.username}`,
      },
    ],
  });
}
