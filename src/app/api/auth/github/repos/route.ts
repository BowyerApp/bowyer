import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/oauth/store";

export const runtime = "nodejs";

/** List GitHub repos for the connected wallet (for Launch wizard repo picker). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "wallet required" }, { status: 400 });
  }

  const token = getAccessToken(wallet, "github");
  if (!token) {
    return NextResponse.json({ ok: false, error: "GitHub not connected" }, { status: 401 });
  }

  const res = await fetch(
    "https://api.github.com/user/repos?per_page=30&sort=updated&affiliation=owner,collaborator,organization_member",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "bowyer-app",
      },
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "Could not fetch repos" }, { status: 502 });
  }

  const repos = (await res.json()) as {
    full_name: string;
    html_url: string;
    private: boolean;
    description: string | null;
  }[];

  return NextResponse.json({
    ok: true,
    repos: repos.map((r) => ({
      fullName: r.full_name,
      url: r.html_url,
      private: r.private,
      description: r.description,
    })),
  });
}
