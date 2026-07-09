// /api/integrations/test — admin-only. Sends a sample alert to the calling
// admin via the requested channel so they can verify it's wired up.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { sendEmailAlert, sendTeamsAlert, sendSmsAlert } from "@/lib/notifier";

const schema = z.object({
  channel: z.enum(["email", "teams", "sms"]),
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

  let result: { ok: boolean; error?: string };
  if (parsed.data.channel === "email") {
    result = await sendEmailAlert(payload);
  } else if (parsed.data.channel === "teams") {
    result = await sendTeamsAlert(payload);
  } else {
    // SMS — read the admin's phone number off their User row
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true },
    });
    if (!me?.phone) {
      return NextResponse.json(
        { ok: false, error: "No phone number on your profile. Add one under Alert preferences on the Notifications page." },
        { status: 400 },
      );
    }
    result = await sendSmsAlert({ ...payload, phone: me.phone });
  }

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
