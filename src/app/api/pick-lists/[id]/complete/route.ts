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
  const shortages: { itemId: string; name: string; picked: number; decremented: number }[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      // Claim the list first — a concurrent complete finds it already COMPLETED
      // and aborts instead of double-decrementing stock.
      const claim = await tx.pickList.updateMany({
        where: { id, status: "IN_PROGRESS" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          completedById: session.user.id,
        },
      });
      if (claim.count === 0) throw new Error("Pick list is no longer in progress.");

      for (const line of linesToDecrement) {
        // Atomic guard: full decrement only if stock covers it.
        const dec = await tx.item.updateMany({
          where: { id: line.itemId, quantity: { gte: line.pickedQty } },
          data: { quantity: { decrement: line.pickedQty } },
        });
        if (dec.count === 0) {
          // Short — take what's there and report it instead of hiding it.
          const item = await tx.item.findUnique({
            where: { id: line.itemId },
            select: { quantity: true, name: true },
          });
          if (!item) continue;
          if (item.quantity > 0) {
            await tx.item.update({
              where: { id: line.itemId },
              data: { quantity: { decrement: item.quantity } },
            });
          }
          shortages.push({
            itemId: line.itemId,
            name: item.name,
            picked: line.pickedQty,
            decremented: item.quantity,
          });
        }
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Complete failed" },
      { status: 409 },
    );
  }

  await logActivity({
    userId: session.user.id,
    action: "PICK_LIST_COMPLETE",
    entityType: "PICK_LIST",
    entityId: id,
    metadata: {
      lines: pl.lines.length,
      picked: linesToDecrement.length,
      units: linesToDecrement.reduce((s, l) => s + l.pickedQty, 0),
      shortages: shortages.length ? shortages : undefined,
    },
  });

  return NextResponse.json({ ok: true, lines: linesToDecrement.length, shortages });
}
