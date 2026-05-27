import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Routes that should never trigger a login redirect:
  //   - login + auth callbacks
  //   - cron endpoints (bearer-authed)
  //   - public alert-subscriber QR signup page + endpoint
  //   - Twilio inbound webhook (must be reachable by Twilio with no cookie)
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/notifications/check" ||
    pathname === "/api/volunteers/missing-data-alert" ||
    pathname === "/api/alert-subscribers/signup" ||
    pathname === "/api/twilio/inbound" ||
    pathname.startsWith("/api/alerts/broadcast") ||
    pathname.startsWith("/api/alerts") ||
    pathname.startsWith("/api/alert-subscribers") ||
    /^\/events\/[^/]+\/alert-signup\/?$/.test(pathname);

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
