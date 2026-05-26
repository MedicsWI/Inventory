// /api/integrations/test — admin-only. Sends a sample alert to the calling
// admin via the requested channel so they can verify it's wired up.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { sendEmailAlert, sendTeamsAlert } from "@/lib/notifier";

const schema = z.object({
  channel: z.enum(["email", "teams"]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const user = {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
  };
  const payload = {
    user,
    title: "Test alert from Medics WI Inventory",
    body: "If you're seeing this, the channel is wired up correctly. No action required.",
    severity: "info" as const,
  };

  const result = parsed.data.channel === "email"
    ? await sendEmailAlert(payload)
    : await sendTeamsAlert(payload);

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
