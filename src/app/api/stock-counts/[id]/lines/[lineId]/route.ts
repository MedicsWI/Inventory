// /api/stock-counts/[id]/lines/[lineId] — record actual qty (counter records this)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  actualQty: z.number().int().min(0),
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

  const count = await prisma.stockCount.findUnique({ where: { id } });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (count.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Cannot record counts on a ${count.status} stock count.` }, { status: 400 });
  }
  // Medics can only record on counts assigned to them
  if (session.user.role === "MEDIC" && count.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.stockCountLine.update({
    where: { id: lineId },
    data: {
      actualQty: parsed.data.actualQty,
      countedAt: new Date(),
      notes: parsed.data.notes !== undefined ? parsed.data.notes : undefined,
    },
  });
  return NextResponse.json(updated);
}
