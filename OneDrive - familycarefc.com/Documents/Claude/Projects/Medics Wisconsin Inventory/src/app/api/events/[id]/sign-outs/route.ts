// /api/events/[id]/sign-outs — add a person row to the event
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  personName: z.string().min(1).max(120),
  role: z.enum(["VOLUNTEER", "STAFF"]).default("VOLUNTEER"),
  userId: z.string().cuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  shifts: z.array(z.string().max(60)).default([]),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const created = await prisma.eventSignOut.create({
    data: {
      eventId: id,
      personName: parsed.data.personName,
      role: parsed.data.role,
      userId: parsed.data.userId ?? null,
      notes: parsed.data.notes ?? null,
      shifts: parsed.data.shifts,
    },
    include: { items: true },
  });
  return NextResponse.json(created, { status: 201 });
}
