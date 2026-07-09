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
  // Record what actually happened per line so the audit log reflects reality
  // (clamps and moved-item skips included), not just the count sheet.
  const applied: { itemId: string; prevQty: number; newQty: number; delta: number }[] = [];
  const skippedMoved: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      // Claim the count first so concurrent approves can't double-apply.
      const claim = await tx.stockCount.updateMany({
        where: { id, status: "REVIEW" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          approvedById: session.user.id,
        },
      });
      if (claim.count === 0) throw new Error("Count is no longer in REVIEW.");

      for (const line of count.lines) {
        if (line.actualQty == null) continue;
        if (line.actualQty === line.expectedQty) continue;
        // Apply the DELTA (actual − expected), not an absolute set — checkouts
        // and receives that happened between submit and approve are preserved.
        const delta = line.actualQty - line.expectedQty;
        const cur = await tx.item.findUnique({
          where: { id: line.itemId },
          select: { quantity: true, locationId: true },
        });
        if (!cur) continue;
        // Item moved out of the counted location since start → this count no
        // longer describes it; don't adjust global stock from a stale scope.
        if (count.locationId && cur.locationId !== count.locationId) {
          skippedMoved.push(line.itemId);
          continue;
        }
        const newQty = Math.max(0, cur.quantity + delta);
        await tx.item.update({
          where: { id: line.itemId },
          data: { quantity: newQty },
        });
        applied.push({ itemId: line.itemId, prevQty: cur.quantity, newQty, delta: newQty - cur.quantity });
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Approve failed" },
      { status: 409 },
    );
  }

  // Per-item audit entry with the REAL before/after quantities.
  for (const a of applied) {
    await logActivity({
      userId: session.user.id,
      action: "ADJUST_QTY",
      entityType: "ITEM",
      entityId: a.itemId,
      before: { quantity: a.prevQty },
      after: { quantity: a.newQty },
      metadata: {
        source: "STOCK_COUNT",
        stockCountId: id,
        stockCountName: count.name,
        delta: a.delta,
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
      skippedMovedItems: skippedMoved.length || undefined,
      countName: count.name,
    },
  });

  return NextResponse.json({ ok: true, applied: applied.length, skippedMoved: skippedMoved.length });
}
