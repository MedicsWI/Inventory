// /api/checkouts/[id] — return (mark returned) or delete (admin undo)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const returnSchema = z.object({
  returnedAt: z.string().datetime().optional(), // defaults to now
  notes: z.string().optional().nullable(),
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

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Atomic guard: only one caller can flip returnedAt — prevents two
      // concurrent returns from double-refunding the item quantity.
      const flip = await tx.checkout.updateMany({
        where: { id, returnedAt: null },
        data: {
          returnedAt: parsed.data.returnedAt ? new Date(parsed.data.returnedAt) : new Date(),
          notes: parsed.data.notes !== undefined ? parsed.data.notes : before.notes,
        },
      });
      if (flip.count === 0) throw new Error("Already returned.");
      await tx.item.update({
        where: { id: before.itemId },
        data: { quantity: { increment: before.quantity } },
      });
      return tx.checkout.findUniqueOrThrow({ where: { id } });
    });

    await logActivity({
      userId: session.user.id,
      action: "RETURN",
      entityType: "CHECKOUT",
      entityId: id,
      metadata: { itemId: before.itemId, quantity: before.quantity },
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
