// Protects all app routes except /login and /api/auth.
// Runs on the Vercel Edge runtime, so it imports auth.config (Edge-safe) —
// NOT the full auth.ts, which pulls in Prisma + bcrypt and would crash here.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/api/auth");

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
  // Skip Next internals and static assets
  matcher: ["/((?!_next|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|webp|gif)).*)"],
};
