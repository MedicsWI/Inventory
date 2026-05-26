// /api/orders/[id]/receive — record received quantity on a line,
// auto-increment the linked item's stock, recompute overall order status.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const schema = z.object({
  lineId: z.string().cuid(),
  receivedDelta: z.number().int().positive(),   // how many to receive NOW (added to existing receivedQty)
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "item:update"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const order = await prisma.incomingOrder.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const line = order.lines.find((l) => l.id === parsed.data.lineId);
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

  const remaining = line.expectedQty - line.receivedQty;
  if (parsed.data.receivedDelta > remaining) {
    return NextResponse.json(
      { error: `Only ${remaining} remaining on this line.` },
      { status: 400 },
    );
  }

  // Apply transactionally: increment line.receivedQty + item.quantity (if linked)
  await prisma.$transaction(async (tx) => {
    await tx.incomingOrderLine.update({
      where: { id: line.id },
      data: { receivedQty: line.receivedQty + parsed.data.receivedDelta },
    });
    if (line.itemId) {
      await tx.item.update({
        where: { id: line.itemId },
        data: { quantity: { increment: parsed.data.receivedDelta } },
      });
    }
  });

  // Recompute overall order status from line states
  const refreshed = await prisma.incomingOrder.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (refreshed) {
    const totalExpected = refreshed.lines.reduce((s, l) => s + l.expectedQty, 0);
    const totalReceived = refreshed.lines.reduce((s, l) => s + l.receivedQty, 0);
    const newStatus =
      totalReceived === 0
        ? refreshed.status === "CANCELED" ? "CANCELED" : refreshed.status === "SHIPPED" ? "SHIPPED" : "ORDERED"
        : totalReceived >= totalExpected
          ? "RECEIVED"
          : "PARTIAL";
    await prisma.incomingOrder.update({
      where: { id },
      data: {
        status: newStatus,
        receivedAt: newStatus === "RECEIVED" ? new Date() : null,
      },
    });
  }

  await logActivity({
    userId: session.user.id,
    action: "ORDER_RECEIVE",
    entityType: "INCOMING_ORDER",
    entityId: id,
    metadata: { lineId: line.id, receivedDelta: parsed.data.receivedDelta, itemId: line.itemId },
  });

  return NextResponse.json({ ok: true });
}
