// /api/stock-counts/[id]/lines/[lineId] — record actual qty (counter records this)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  actualQty: z.number().int().min(0).max(1_000_000),
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

  const count = await prisma.stockCount.findUnique({ where: { id } });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (count.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Cannot record counts on a ${count.status} stock count.` }, { status: 400 });
  }
  // Medics can only record on counts assigned to them
  if (session.user.role === "MEDIC" && count.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Scoped write — the guards above were checked against count `id`, so the
  // line MUST belong to that count (a bare lineId could target another count).
  const res = await prisma.stockCountLine.updateMany({
    where: { id: lineId, stockCountId: id },
    data: {
      actualQty: parsed.data.actualQty,
      countedAt: new Date(),
      notes: parsed.data.notes !== undefined ? parsed.data.notes : undefined,
    },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Line not found on this stock count." }, { status: 404 });
  }
  const updated = await prisma.stockCountLine.findUnique({ where: { id: lineId } });
  return NextResponse.json(updated);
}
