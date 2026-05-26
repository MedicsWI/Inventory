// /api/events/[id] — get + update + delete
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["PLANNED", "ACTIVE", "CLOSED", "CANCELED"]).optional(),
  gearCategories: z.array(z.string().min(1).max(40)).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      template: { select: { id: true, name: true } },
      shifts: { orderBy: [{ sortOrder: "asc" }, { startsAt: "asc" }] },
      signOuts: {
        orderBy: { createdAt: "asc" },
        include: {
          items: { orderBy: { createdAt: "asc" } },
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(event);
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

  const updated = await prisma.event.update({
    where: { id },
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
  const { id } = await ctx.params;
  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
