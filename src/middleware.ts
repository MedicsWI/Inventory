import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// Phase 7 cutover (Ops Hub task #130). Moved API + UI paths are intercepted
// here so users / external callers always see the right thing:
//   - API paths → return 503 with a JSON pointer to the Ops Hub
//   - UI paths  → redirect to /moved which shows a friendly "this has moved" page
// Once Phase 8 decommission lands (delete the underlying code), these lists go
// away too.
const MOVED_API_PREFIXES = [
  "/api/events",
  "/api/volunteers",
  "/api/alert-subscribers",
  "/api/alerts",
];
const MOVED_API_EXACT = ["/api/twilio/inbound"];

function isMovedApi(pathname: string): boolean {
  if (MOVED_API_EXACT.includes(pathname)) return true;
  return MOVED_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function isMovedUi(pathname: string): boolean {
  return (
    pathname === "/events" ||
    pathname.startsWith("/events/") ||
    pathname === "/volunteers" ||
    pathname.startsWith("/volunteers/") ||
    pathname === "/event-templates" ||
    pathname.startsWith("/event-templates/") ||
    pathname === "/alert-groups" ||
    pathname.startsWith("/alert-groups/") ||
    pathname.startsWith("/account/alerts")
  );
}

const OPS_HUB_URL = "https://ops.medicswisconsin.com";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // 1. Moved API endpoints — 503 with a pointer. Runs before auth so external
  //    callers (Twilio webhook, Ops Hub server) don't see a login redirect.
  if (isMovedApi(pathname)) {
    return NextResponse.json(
      {
        error: "Moved",
        message: "This endpoint has moved to the Medics Wisconsin Operations Hub.",
        opsHubUrl: OPS_HUB_URL,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 2. Moved UI paths — redirect to the /moved banner page (no login needed).
  //    307 preserves the method for any odd-shaped GET that landed here.
  if (isMovedUi(pathname)) {
    return NextResponse.redirect(new URL("/moved", req.nextUrl), 307);
  }

  // Routes that should never trigger a login redirect.
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/notifications/check" ||
    pathname === "/moved";

  if (isAuthRoute) {
    if (isLoggedIn && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|webp|gif)).*)"],
};
