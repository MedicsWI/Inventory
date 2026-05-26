// /api/event-templates/[id] — get + update + delete
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM 24-hour");

const shiftSchema = z.object({
  name: z.string().min(1).max(60),
  startsAtTime: timeOfDay.optional().nullable(),
  endsAtTime: timeOfDay.optional().nullable(),
  sortOrder: z.number().int().optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  gearCategories: z.array(z.string().min(1).max(40)).optional(),
  shifts: z.array(shiftSchema).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const t = await prisma.eventTemplate.findUnique({
    where: { id },
    include: { shifts: { orderBy: { sortOrder: "asc" } } },
  });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:update"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { shifts, ...meta } = parsed.data;
  if (shifts) {
    await prisma.$transaction(async (tx) => {
      await tx.eventTemplateShift.deleteMany({ where: { templateId: id } });
      await tx.eventTemplateShift.createMany({
        data: shifts.map((s, i) => ({
          templateId: id,
          name: s.name,
          startsAtTime: s.startsAtTime ?? null,
          endsAtTime: s.endsAtTime ?? null,
          sortOrder: s.sortOrder ?? i,
        })),
      });
      if (Object.keys(meta).length) {
        await tx.eventTemplate.update({ where: { id }, data: meta });
      }
    });
  } else if (Object.keys(meta).length) {
    await prisma.eventTemplate.update({ where: { id }, data: meta });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:delete"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const { id } = await ctx.params;
  await prisma.eventTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
