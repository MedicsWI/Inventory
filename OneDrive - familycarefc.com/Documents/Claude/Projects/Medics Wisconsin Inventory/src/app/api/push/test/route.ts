// /api/push/test — send a test push to the calling user's subscriptions.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushAlert, isPushConfigured } from "@/lib/notifier";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ error: "VAPID keys not configured." }, { status: 503 });

  const subs = await prisma.pushSubscription.findMany({ where: { userId: session.user.id } });
  if (subs.length === 0) return NextResponse.json({ error: "No push subscriptions on this account." }, { status: 400 });

  const result = await sendPushAlert({
    user: { id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? "" },
    title: "Test push from Medics WI Inventory",
    body: "If you see this, push notifications are wired up correctly.",
    severity: "info",
  });
  return NextResponse.json({ ok: result.ok, sent: result.sent, removed: result.removed, error: result.error });
}
