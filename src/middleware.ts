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
  matcher: ["/((?!_next|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|webp|gif)).*)"],
};
