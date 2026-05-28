// /api/stock-counts/[id]/approve — manager applies discrepancies, completes count.
//
// Writes:
//   1. Item quantity updates inside a transaction.
//   2. An ADJUST_QTY activity row per item changed — so the activity log links
//      stock-count adjustments back to specific items (and so item history pages
//      show "adjusted via stock count <name>"). Bulk audit log entry stays too.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:update"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: { lines: { include: { item: { select: { id: true, name: true } } } } },
  });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (count.status !== "REVIEW") {
    return NextResponse.json({ error: `Can only approve from REVIEW; this is ${count.status}.` }, { status: 400 });
  }

  const discrepancies = count.lines.filter((l) => l.actualQty != null && l.actualQty !== l.expectedQty);

  await prisma.$transaction(async (tx) => {
    for (const line of count.lines) {
      if (line.actualQty == null) continue;
      if (line.actualQty === line.expectedQty) continue;
      await tx.item.update({
        where: { id: line.itemId },
        data: { quantity: line.actualQty },
      });
    }
    await tx.stockCount.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        approvedById: session.user.id,
      },
    });
  });

  // Per-item audit entry so item history shows the stock-count source.
  for (const line of discrepancies) {
    await logActivity({
      userId: session.user.id,
      action: "ADJUST_QTY",
      entityType: "ITEM",
      entityId: line.itemId,
      before: { quantity: line.expectedQty },
      after: { quantity: line.actualQty },
      metadata: {
        source: "STOCK_COUNT",
        stockCountId: id,
        stockCountName: count.name,
        delta: (line.actualQty ?? 0) - line.expectedQty,
      },
    });
  }

  await logActivity({
    userId: session.user.id,
    action: "STOCK_COUNT_APPROVE",
    entityType: "STOCK_COUNT",
    entityId: id,
    metadata: {
      totalLines: count.lines.length,
      discrepancies: discrepancies.length,
      uncounted: count.lines.filter((l) => l.actualQty == null).length,
      countName: count.name,
    },
  });

  return NextResponse.json({ ok: true, applied: discrepancies.length });
}
