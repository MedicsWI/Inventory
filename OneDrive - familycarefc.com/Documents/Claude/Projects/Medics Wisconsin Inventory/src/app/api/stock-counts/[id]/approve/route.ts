// /api/stock-counts/[id]/approve — manager applies discrepancies, completes count
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
    include: { lines: true },
  });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (count.status !== "REVIEW") {
    return NextResponse.json({ error: `Can only approve from REVIEW; this is ${count.status}.` }, { status: 400 });
  }

  // Apply each line's actualQty to the item, recording an activity per discrepancy
  const discrepancies = count.lines.filter((l) => l.actualQty != null && l.actualQty !== l.expectedQty);

  await prisma.$transaction(async (tx) => {
    for (const line of count.lines) {
      if (line.actualQty == null) continue;          // uncounted lines stay as-is
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

  await logActivity({
    userId: session.user.id,
    action: "STOCK_COUNT_APPROVE",
    entityType: "STOCK_COUNT",
    entityId: id,
    metadata: {
      totalLines: count.lines.length,
      discrepancies: discrepancies.length,
      uncounted: count.lines.filter((l) => l.actualQty == null).length,
    },
  });

  return NextResponse.json({ ok: true, applied: discrepancies.length });
}
