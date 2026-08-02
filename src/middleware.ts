import { NextResponse, type NextRequest } from "next/server";

/**
 * Site lockdown ("BOWYER V2" countdown).
 *
 * When LOCKDOWN=1, every human-facing page is rewritten to /v2. The machine
 * surfaces stay online: /api/* (Telegram webhook, MCP, x402, ACP, registry),
 * the Telegram mini app, and all static assets.
 *
 * Crew bypass: visit any page with ?backstage=<LOCKDOWN_BYPASS_KEY> once to
 * browse the real site from that browser (cookie, 7 days).
 */

const BYPASS_COOKIE = "bowyer-backstage";

export function middleware(request: NextRequest) {
  if (process.env.LOCKDOWN !== "1") return NextResponse.next();

  const url = request.nextUrl;
  const bypassKey = process.env.LOCKDOWN_BYPASS_KEY?.trim() || "backstage";

  const provided = url.searchParams.get("backstage");
  if (provided === bypassKey) {
    const clean = url.clone();
    clean.searchParams.delete("backstage");
    const response = NextResponse.redirect(clean);
    response.cookies.set(BYPASS_COOKIE, "1", {
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  if (request.cookies.get(BYPASS_COOKIE)?.value === "1") {
    return NextResponse.next();
  }

  if (url.pathname === "/v2") return NextResponse.next();

  const rewritten = url.clone();
  rewritten.pathname = "/v2";
  rewritten.search = "";
  return NextResponse.rewrite(rewritten);
}

export const config = {
  // Everything except API routes, Next internals, the Telegram mini app,
  // referral links (/r/<code> must set its cookie even during lockdown),
  // and static files (any path containing a dot: videos, images, models...).
  matcher: ["/((?!api|_next|telegram|r/|.*\\..*).*)"],
};
