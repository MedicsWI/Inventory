// Edge-safe NextAuth config. Imported by middleware.ts (which runs on Edge)
// and by auth.ts (the full server-side config that adds the Prisma adapter
// and the Credentials provider with bcrypt). Anything that uses Node-only
// APIs (Prisma, bcrypt, fs, etc.) must live in auth.ts, not here.
import type { NextAuthConfig, DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
  }
}

export const authConfig = {
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  pages: { signIn: "/login" },
  // Providers list is overridden in auth.ts to add Credentials with bcrypt.
  providers: [],
  callbacks: {
    // jwt/session callbacks here are safe — they only touch the token, not the DB.
    // The DB-touching jwt callback lives in auth.ts.
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      if (token.role) session.user.role = token.role as Role;
      return session;
    },
  },
} satisfies NextAuthConfig;

