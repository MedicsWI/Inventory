// Shared helper for endpoints that must accept BOTH:
//   - Cookie-authenticated ADMIN / MANAGER from this app, AND
//   - Ops Hub server-to-server calls with a Bearer API key.
//
// Ops Hub passes:
//   Authorization: Bearer <OPSHUB_API_KEY>
//   X-OpsHub-Actor: "dispatcher: Jane Doe"      (free-form label, logged for audit)
//
// Configure OPSHUB_API_KEY in Vercel env. Rotate by changing the env var and
// pushing the new value to the Ops Hub side.

import type { Session } from "next-auth";

export type CallerIdentity =
  | { kind: "user"; userId: string; label: string }
  | { kind: "opshub"; label: string };

export function identifyCaller(req: Request, session: Session | null): CallerIdentity | null {
  if (session?.user?.id && (session.user.role === "ADMIN" || session.user.role === "MANAGER")) {
    return {
      kind: "user",
      userId: session.user.id,
      label: session.user.name ?? session.user.email ?? "user",
    };
  }

  const apiKey = process.env.OPSHUB_API_KEY;
  const authHeader = req.headers.get("authorization") ?? "";
  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    const actor = (req.headers.get("x-opshub-actor") ?? "ops-hub").slice(0, 120);
    return { kind: "opshub", label: `ops-hub:${actor}` };
  }

  return null;
}
