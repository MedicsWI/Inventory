// /api/alert-subscribers/[id] — edit / remove a single subscriber.
// Admin / Ops Hub only. The subscriber themselves opts out via SMS STOP
// (handled in /api/twilio/inbound).

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/twilio";
import { identifyCaller } from "@/lib/ops-hub-auth";

const TOPICS = ["LOST_CHILD", "SEVERE_WEATHER", "ALL_HANDS", "GEAR_RETURN"] as const;

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().optional(),
  department: z.string().max(80).nullable().optional(),
  topics: z.array(z.enum(TOPICS)).optional(),
  stopped: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  const caller = identifyCaller(req, session);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = { ...parsed.data } as Record<string, unknown>;
  if (parsed.data.phone) {
    const norm = normalizePhone(parsed.data.phone);
    if (!norm) return NextResponse.json({ error: "Phone must be E.164" }, { status: 400 });
    data.phone = norm;
  }
  if (parsed.data.stopped === true) {
    data.stoppedAt = new Date();
  } else if (parsed.data.stopped === false) {
    data.stoppedAt = null;
  }

  const updated = await prisma.alertSubscriber.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const session = await auth();
  const caller = identifyCaller(req, session);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  await prisma.alertSubscriber.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
