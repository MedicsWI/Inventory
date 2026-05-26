// /api/stock-counts/[id] — get, update meta, delete
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  notes: z.string().optional().nullable(),
  assignedToId: z.string().cuid().nullable().optional(),
  locationId: z.string().cuid().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: {
      location: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      lines: {
        include: {
          item: { select: { id: true, name: true, unit: true, barcode: true, photoUrl: true } },
        },
        orderBy: { item: { name: "asc" } },
      },
    },
  });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Medics can only access counts assigned to them
  if (session.user.role === "MEDIC" && count.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(count);
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

  const updated = await prisma.stockCount.update({ where: { id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:delete"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const { id } = await ctx.params;
  await prisma.stockCount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
