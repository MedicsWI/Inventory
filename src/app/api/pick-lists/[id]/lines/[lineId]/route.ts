// /api/pick-lists/[id]/lines/[lineId] — record pickedQty (idempotent set, not delta)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  pickedQty: z.number().int().min(0),
  notes: z.string().optional().nullable(),
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

  const updated = await prisma.pickListLine.update({
    where: { id: lineId },
    data: {
      pickedQty: parsed.data.pickedQty,
      pickedAt: parsed.data.pickedQty > 0 ? new Date() : null,
      notes: parsed.data.notes !== undefined ? parsed.data.notes : undefined,
    },
  });
  return NextResponse.json(updated);
}
