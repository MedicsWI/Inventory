// /api/stock-counts/[id]/start — snapshot current item qtys into lines, set IN_PROGRESS
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const count = await prisma.stockCount.findUnique({ where: { id } });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Managers can start any count; the assigned medic can start their own
  // (otherwise counts assigned to medics stall until a manager presses Start).
  const isAssignee = count.assignedToId === session.user.id;
  if (!isAssignee) {
    try { assertCan(session.user.role, "location:update"); }
    catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  }
  if (count.status !== "DRAFT") {
    return NextResponse.json({ error: `Count is ${count.status}, can only start a DRAFT.` }, { status: 400 });
  }

  // Pull items in scope: if a location is set, that location's items; else all items
  const items = await prisma.item.findMany({
    where: count.locationId ? { locationId: count.locationId } : {},
    select: { id: true, quantity: true },
  });

  if (items.length === 0) {
    return NextResponse.json({ error: "No items in scope for this count." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockCountLine.createMany({
      data: items.map((i) => ({
        stockCountId: id,
        itemId: i.id,
        expectedQty: i.quantity,
      })),
      skipDuplicates: true,
    });
    await tx.stockCount.update({
      where: { id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
  });

  await logActivity({
    userId: session.user.id,
    action: "STOCK_COUNT_START",
    entityType: "STOCK_COUNT",
    entityId: id,
    metadata: { itemCount: items.length },
  });

  return NextResponse.json({ ok: true, itemCount: items.length });
}
