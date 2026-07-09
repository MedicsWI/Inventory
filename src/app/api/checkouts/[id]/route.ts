// /api/checkouts/[id] — return (mark returned) or delete (admin undo)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const returnSchema = z.object({
  returnedAt: z.string().datetime().optional(), // defaults to now
  returnQty: z.number().int().positive().max(1_000_000).optional(), // partial return; defaults to full
  notes: z.string().max(2000).optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = returnSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const before = await prisma.checkout.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.returnedAt) return NextResponse.json({ error: "Already returned." }, { status: 400 });

  // Medics can only return their own checkouts.
  if (session.user.role === "MEDIC" && before.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const returnQty = parsed.data.returnQty ?? before.quantity;
  if (returnQty > before.quantity) {
    return NextResponse.json(
      { error: `Only ${before.quantity} checked out on this record.` },
      { status: 400 },
    );
  }
  // Clamp returnedAt to [checkedOutAt, now] — back/future-dating corrupts overdue math.
  let returnedAt = parsed.data.returnedAt ? new Date(parsed.data.returnedAt) : new Date();
  const now = new Date();
  if (returnedAt > now) returnedAt = now;
  if (returnedAt < before.checkedOutAt) returnedAt = before.checkedOutAt;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (returnQty === before.quantity) {
        // Full return — atomic guard: only one caller can flip returnedAt.
        const flip = await tx.checkout.updateMany({
          where: { id, returnedAt: null },
          data: {
            returnedAt,
            notes: parsed.data.notes !== undefined ? parsed.data.notes : before.notes,
          },
        });
        if (flip.count === 0) throw new Error("Already returned.");
      } else {
        // Partial return — shrink the open checkout, record the returned part
        // as its own (closed) row so history stays accurate.
        const shrink = await tx.checkout.updateMany({
          where: { id, returnedAt: null, quantity: before.quantity },
          data: { quantity: { decrement: returnQty } },
        });
        if (shrink.count === 0) throw new Error("Checkout changed — refresh and try again.");
        await tx.checkout.create({
          data: {
            itemId: before.itemId,
            userId: before.userId,
            quantity: returnQty,
            checkedOutAt: before.checkedOutAt,
            expectedReturnAt: before.expectedReturnAt,
            returnedAt,
            notes: parsed.data.notes ?? before.notes,
          },
        });
      }
      await tx.item.update({
        where: { id: before.itemId },
        data: { quantity: { increment: returnQty } },
      });
      return tx.checkout.findUniqueOrThrow({ where: { id } });
    });

    await logActivity({
      userId: session.user.id,
      action: "RETURN",
      entityType: "CHECKOUT",
      entityId: id,
      metadata: {
        itemId: before.itemId,
        quantity: returnQty,
        partial: returnQty < before.quantity || undefined,
        remaining: before.quantity - returnQty || undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Return failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const before = await prisma.checkout.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If still active, refund the quantity before deletion
  if (!before.returnedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id: before.itemId },
        data: { quantity: { increment: before.quantity } },
      });
      await tx.checkout.delete({ where: { id } });
    });
  } else {
    await prisma.checkout.delete({ where: { id } });
  }

  await logActivity({
    userId: session.user.id,
    action: "DELETE",
    entityType: "CHECKOUT",
    entityId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
  return NextResponse.json({ ok: true });
}
