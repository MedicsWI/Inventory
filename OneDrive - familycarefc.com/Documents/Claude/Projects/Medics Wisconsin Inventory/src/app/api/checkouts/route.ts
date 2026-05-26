// /api/checkouts — list + create
// On create, decrement the item's available quantity transactionally.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

const createSchema = z.object({
  itemId: z.string().cuid(),
  userId: z.string().cuid(),                  // borrower
  quantity: z.number().int().positive().default(1),
  expectedReturnAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // "active" | "returned" | omitted
  const userId = searchParams.get("userId") || undefined;
  const itemId = searchParams.get("itemId") || undefined;
  const mineOnly = searchParams.get("mine") === "1";

  const where: Parameters<typeof prisma.checkout.findMany>[0] = { where: {} };
  if (status === "active") where.where = { ...where.where, returnedAt: null };
  if (status === "returned") where.where = { ...where.where, returnedAt: { not: null } };
  if (mineOnly) where.where = { ...where.where, userId: session.user.id };
  if (userId) where.where = { ...where.where, userId };
  if (itemId) where.where = { ...where.where, itemId };

  // Medics can only see their own checkouts unless they have user:manage (admin/manager).
  if (session.user.role === "MEDIC") {
    where.where = { ...where.where, userId: session.user.id };
  }

  const rows = await prisma.checkout.findMany({
    ...where,
    orderBy: [{ returnedAt: "asc" }, { checkedOutAt: "desc" }],
    include: {
      item: { select: { id: true, name: true, unit: true, returnable: true, photoUrl: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    take: 500,
  });

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { itemId, userId, quantity, expectedReturnAt, notes } = parsed.data;

  try {
    const checkout = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) throw new Error("Item not found");
      if (item.quantity < quantity) throw new Error(`Only ${item.quantity} available`);
      if (!item.returnable) throw new Error("This item isn't marked as returnable equipment. Use qty adjust instead.");

      const c = await tx.checkout.create({
        data: {
          itemId,
          userId,
          quantity,
          expectedReturnAt: expectedReturnAt ? new Date(expectedReturnAt) : null,
          notes: notes ?? null,
        },
      });
      await tx.item.update({
        where: { id: itemId },
        data: { quantity: { decrement: quantity } },
      });
      return c;
    });

    await logActivity({
      userId: session.user.id,
      action: "CHECKOUT",
      entityType: "CHECKOUT",
      entityId: checkout.id,
      metadata: { itemId, borrowerUserId: userId, quantity },
    });

    return NextResponse.json(checkout, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout failed" },
      { status: 400 },
    );
  }
}
