// /api/pick-lists/[id]/lines/[lineId] — record pickedQty (idempotent set, not delta)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  pickedQty: z.number().int().min(0).max(1_000_000),
  notes: z.string().max(2000).optional().nullable(),
});

type Ctx = { params: Promise<{ id: string; lineId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, lineId } = await ctx.params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const pl = await prisma.pickList.findUnique({ where: { id } });
  if (!pl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pl.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Cannot pick on a ${pl.status} list.` }, { status: 400 });
  }
  if (session.user.role === "MEDIC" && pl.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Guard against fat-finger over-picks: picking more than requested is almost
  // always a typo (5 → 500) and /complete will decrement stock by this number.
  const line = await prisma.pickListLine.findFirst({
    where: { id: lineId, pickListId: id }, // scoped — a lineId from another list 404s
    select: { requestedQty: true },
  });
  if (!line) return NextResponse.json({ error: "Line not found on this pick list." }, { status: 404 });
  if (parsed.data.pickedQty > line.requestedQty) {
    return NextResponse.json(
      { error: `Picked ${parsed.data.pickedQty} exceeds requested ${line.requestedQty}. Adjust the requested qty first if that's intentional.` },
      { status: 400 },
    );
  }

  // updateMany keeps the parent scope in the WHERE — never trust bare lineId.
  await prisma.pickListLine.updateMany({
    where: { id: lineId, pickListId: id },
    data: {
      pickedQty: parsed.data.pickedQty,
      pickedAt: parsed.data.pickedQty > 0 ? new Date() : null,
      notes: parsed.data.notes !== undefined ? parsed.data.notes : undefined,
    },
  });
  const updated = await prisma.pickListLine.findUnique({ where: { id: lineId } });
  return NextResponse.json(updated);
}
