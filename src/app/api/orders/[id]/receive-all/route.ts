// /api/orders/[id]/receive-all — accept the remaining qty on every line in one go.
// Used by the "Receive full order" button after the user confirms everything's correct.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "item:update"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const order = await prisma.incomingOrder.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status === "CANCELED" || order.status === "RECEIVED") {
    return NextResponse.json({ error: `Order is ${order.status} — nothing to receive.` }, { status: 400 });
  }

  // Compute per-line delta = remaining
  const updates = order.lines
    .map((l) => ({ line: l, delta: l.expectedQty - l.receivedQty }))
    .filter((u) => u.delta > 0);

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing remaining to receive." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Claim the order first — a second concurrent receive-all finds it
      // already RECEIVED and aborts instead of double-incrementing stock.
      const claim = await tx.incomingOrder.updateMany({
        where: { id, status: { notIn: ["CANCELED", "RECEIVED"] } },
        data: { status: "RECEIVED", receivedAt: new Date() },
      });
      if (claim.count === 0) throw new Error("Order was already received or canceled.");

      for (const { line, delta } of updates) {
        // Optimistic guard per line: skip if someone received it since our read.
        const upd = await tx.incomingOrderLine.updateMany({
          where: { id: line.id, receivedQty: line.receivedQty },
          data: { receivedQty: { increment: delta } },
        });
        if (upd.count > 0 && line.itemId) {
          await tx.item.update({
            where: { id: line.itemId },
            data: { quantity: { increment: delta } },
          });
        }
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Receive failed" },
      { status: 409 },
    );
  }

  await logActivity({
    userId: session.user.id,
    action: "ORDER_RECEIVE",
    entityType: "INCOMING_ORDER",
    entityId: id,
    metadata: {
      bulkReceive: true,
      lineCount: updates.length,
      totalUnits: updates.reduce((s, u) => s + u.delta, 0),
      unlinkedLines: updates.filter((u) => !u.line.itemId).length,
    },
  });

  return NextResponse.json({
    ok: true,
    linesReceived: updates.length,
    totalUnits: updates.reduce((s, u) => s + u.delta, 0),
  });
}
