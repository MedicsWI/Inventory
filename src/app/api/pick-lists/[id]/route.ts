// /api/pick-lists/[id] — get + update meta + delete
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

// Status is deliberately NOT free-form here: COMPLETED only ever happens via
// /complete (which decrements stock atomically), IN_PROGRESS via /start.
// Allowing arbitrary status writes let a COMPLETED list be flipped back and
// completed again — double-decrementing stock. Only CANCELED is accepted.
const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  destination: z.string().max(120).nullable().optional(),
  notes: z.string().nullable().optional(),
  assignedToId: z.string().cuid().nullable().optional(),
  fromLocationId: z.string().cuid().nullable().optional(),
  status: z.literal("CANCELED").optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const pl = await prisma.pickList.findUnique({
    where: { id },
    include: {
      fromLocation: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      completedBy: { select: { id: true, name: true, email: true } },
      template: { select: { id: true, name: true } },
      lines: {
        orderBy: { item: { name: "asc" } },
        include: { item: { select: { id: true, name: true, unit: true, barcode: true, quantity: true, photoUrl: true } } },
      },
    },
  });
  if (!pl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role === "MEDIC" && pl.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(pl);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let data: z.infer<typeof patchSchema> = parsed.data;

  // Medics can only update notes on their own picks — enforce the whitelist.
  if (session.user.role === "MEDIC") {
    const pl = await prisma.pickList.findUnique({ where: { id }, select: { assignedToId: true } });
    if (!pl || pl.assignedToId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    data = { notes: parsed.data.notes };
    if (data.notes === undefined) {
      return NextResponse.json({ error: "Medics can only update notes." }, { status: 403 });
    }
  }

  // Cancel: only from DRAFT / IN_PROGRESS (COMPLETED lists already moved stock).
  if (data.status === "CANCELED") {
    const flipped = await prisma.pickList.updateMany({
      where: { id, status: { in: ["DRAFT", "IN_PROGRESS"] } },
      data,
    });
    if (flipped.count === 0) {
      return NextResponse.json({ error: "Only draft or in-progress lists can be canceled." }, { status: 409 });
    }
    const updated = await prisma.pickList.findUnique({ where: { id } });
    return NextResponse.json(updated);
  }

  const updated = await prisma.pickList.update({
    where: { id },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:delete"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const { id } = await ctx.params;
  await prisma.pickList.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
