// /api/pick-lists/[id]/complete — finalize the pick, decrement source item stock
// by each line's pickedQty, set COMPLETED.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const pl = await prisma.pickList.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!pl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pl.status !== "IN_PROGRESS") return NextResponse.json({ error: `Status is ${pl.status}` }, { status: 400 });
  if (session.user.role === "MEDIC" && pl.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const linesToDecrement = pl.lines.filter((l) => l.pickedQty > 0);

  await prisma.$transaction(async (tx) => {
    for (const line of linesToDecrement) {
      // Bound by current quantity to prevent negative stock
      const item = await tx.item.findUnique({ where: { id: line.itemId }, select: { quantity: true } });
      if (!item) continue;
      const decrement = Math.min(line.pickedQty, item.quantity);
      if (decrement > 0) {
        await tx.item.update({
          where: { id: line.itemId },
          data: { quantity: { decrement } },
        });
      }
    }
    await tx.pickList.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedById: session.user.id,
      },
    });
  });

  await logActivity({
    userId: session.user.id,
    action: "PICK_LIST_COMPLETE",
    entityType: "PICK_LIST",
    entityId: id,
    metadata: {
      lines: pl.lines.length,
      picked: linesToDecrement.length,
      units: linesToDecrement.reduce((s, l) => s + l.pickedQty, 0),
    },
  });

  return NextResponse.json({ ok: true, lines: linesToDecrement.length });
}
