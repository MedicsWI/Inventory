// /api/events/[id]/shifts/[shiftId] — update or delete a shift
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

type Ctx = { params: Promise<{ id: string; shiftId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:update"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { shiftId } = await ctx.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.eventShift.update({
    where: { id: shiftId },
    data: {
      ...parsed.data,
      startsAt: parsed.data.startsAt === undefined ? undefined : parsed.data.startsAt === null ? null : new Date(parsed.data.startsAt),
      endsAt: parsed.data.endsAt === undefined ? undefined : parsed.data.endsAt === null ? null : new Date(parsed.data.endsAt),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:delete"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const { shiftId } = await ctx.params;
  await prisma.eventShift.delete({ where: { id: shiftId } });
  return NextResponse.json({ ok: true });
}
