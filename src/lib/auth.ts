// Full server-side NextAuth instance. NOT safe for Edge runtime — pulls in
// Prisma adapter and Graph email sender. Middleware uses auth.config.ts instead.
import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";
import { sendViaGraph } from "@/lib/graph-mail";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    // M365 / Entra ID single sign-on. Users sign in with their @medicswisconsin.com account.
    // First-time sign-in matches by email and links to the existing User row (preserving role).
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
      // Link OAuth account to an existing User by email. Safe in our single-tenant context.
      allowDangerousEmailAccountLinking: true,
    }),
    // Magic-link sign-in: user enters their email, we send them a one-time link via
    // Microsoft Graph (same sender mailbox used for system alerts). Click → signed in.
    EmailProvider({
      // Dummy server config — the provider validates this exists, but our custom
      // sendVerificationRequest below overrides nodemailer entirely, so this is unused.
      server: { host: "localhost", port: 1, auth: { user: "noop", pass: "noop" } },
      from: process.env.GRAPH_SEND_FROM,
      async sendVerificationRequest({ identifier, url, expires }) {
        const host = new URL(url).host;
        const expiresAt = expires
          ? new Date(expires).toLocaleString("en-US", { timeZone: "America/Chicago" })
          : "in 24 hours";
        const html = `
          <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
            <div style="border-bottom:2px solid #0ea5e9;padding-bottom:12px;margin-bottom:16px">
              <div style="font-size:20px;font-weight:700">Medics Wisconsin Inventory</div>
              <div style="font-size:12px;color:#666">Sign in link</div>
            </div>
            <p>Click the button below to sign in to <strong>${host}</strong>. The link expires ${expiresAt}.</p>
            <p style="margin:24px 0">
              <a href="${url}" style="background:#0ea5e9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Sign in</a>
            </p>
            <p style="font-size:12px;color:#666">If the button doesn't work, paste this link into your browser:</p>
            <p style="font-size:11px;color:#666;word-break:break-all">${url}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
            <p style="font-size:11px;color:#666">If you didn't request this, you can safely ignore it.</p>
          </div>
        `;
        const text = `Sign in to ${host}\n\n${url}\n\nLink expires ${expiresAt}. If you didn't request this, ignore this email.`;
        const result = await sendViaGraph({
          to: identifier,
          subject: `Sign in to Medics WI Inventory`,
          html,
          text,
        });
        if (!result.ok) {
          throw new Error(`Magic-link email send failed: ${result.error ?? "unknown"}`);
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // On every JWT mint, stamp id (first sign-in only) then always re-fetch role
    // from DB so that role changes take effect on the next token refresh without
    // requiring the user to sign out.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      if (token.id) {
        const db = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        });
        if (db) token.role = db.role;
      }
      return token;
    },
  },
});
