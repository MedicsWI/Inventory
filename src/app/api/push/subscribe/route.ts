// /api/push/subscribe — store a browser's push subscription
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().max(500),
    auth: z.string().max(500),
  }),
  userAgent: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Endpoints belong to a browser profile; if this one is already registered
  // to a DIFFERENT user, don't silently reassign it (subscription takeover).
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: parsed.data.endpoint },
    select: { userId: true },
  });
  if (existing && existing.userId !== session.user.id) {
    // Same physical browser, new signed-in user — replace cleanly.
    await prisma.pushSubscription.delete({ where: { endpoint: parsed.data.endpoint } });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: {
      userId: session.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent ?? null,
    },
    update: {
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent ?? undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
