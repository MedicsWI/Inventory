// /api/items/[id] — get, update, delete
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  sku: z.string().max(120).nullable().optional(),
  barcode: z.string().max(200).nullable().optional(),
  quantity: z.number().int().nonnegative().max(1_000_000).optional(),
  // Atomic adjust: +N/−N applied server-side (floored at 0). Use this from
  // quick +/− buttons — an absolute `quantity` computed from a cached read
  // loses concurrent updates from other users.
  quantityDelta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  unit: z.string().max(40).nullable().optional(),
  lotNumber: z.string().max(120).nullable().optional(),
  expirationDate: z.string().datetime().nullable().optional(),
  lowStockThreshold: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
  locationId: z.string().cuid().nullable().optional(),
  categoryId: z.string().cuid().nullable().optional(),
  returnable: z.boolean().optional(),
  tileDeviceId: z.string().nullable().optional(),
  tagIds: z.array(z.string().cuid()).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.item.findUnique({
    where: { id },
    include: { location: true, category: true, tags: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.quantity !== undefined && parsed.data.quantityDelta !== undefined) {
    return NextResponse.json({ error: "Send quantity OR quantityDelta, not both." }, { status: 400 });
  }

  // Quantity-only update is allowed for MEDIC; full updates require item:update
  const keys = Object.keys(parsed.data);
  const isQuantityOnly =
    keys.length === 1 && (keys[0] === "quantity" || keys[0] === "quantityDelta");
  try {
    assertCan(session.user.role, isQuantityOnly ? "item:adjust-qty" : "item:update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const before = await prisma.item.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { tagIds, quantityDelta, ...rest } = parsed.data;

  // Atomic delta path — clamp at 0 without losing concurrent changes.
  if (quantityDelta !== undefined) {
    if (quantityDelta < 0) {
      const dec = await prisma.item.updateMany({
        where: { id, quantity: { gte: -quantityDelta } },
        data: { quantity: { increment: quantityDelta } },
      });
      if (dec.count === 0) {
        // Less on hand than the decrement — floor at zero.
        await prisma.item.update({ where: { id }, data: { quantity: 0 } });
      }
    } else if (quantityDelta > 0) {
      await prisma.item.update({ where: { id }, data: { quantity: { increment: quantityDelta } } });
    }
    const after = await prisma.item.findUniqueOrThrow({ where: { id }, include: { tags: true } });
    await logActivity({
      userId: session.user.id,
      action: "ADJUST_QTY",
      entityType: "ITEM",
      entityId: id,
      before: { quantity: before.quantity },
      after: { quantity: after.quantity },
      metadata: { delta: quantityDelta },
    });
    return NextResponse.json(after);
  }
  const updated = await prisma.item.update({
    where: { id },
    data: {
      ...rest,
      expirationDate:
        rest.expirationDate === undefined
          ? undefined
          : rest.expirationDate === null
            ? null
            : new Date(rest.expirationDate),
      // If tagIds was provided, replace the set; if undefined, leave alone
      ...(tagIds !== undefined ? { tags: { set: tagIds.map((tagId) => ({ id: tagId })) } } : {}),
    },
    include: { tags: true },
  });

  await logActivity({
    userId: session.user.id,
    action: isQuantityOnly ? "ADJUST_QTY" : "UPDATE",
    entityType: "ITEM",
    entityId: updated.id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(updated)),
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertCan(session.user.role, "item:delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const before = await prisma.item.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Deleting an item cascades its checkouts — block while gear is still out
  // so active checkouts can't silently vanish.
  const activeCheckouts = await prisma.checkout.count({
    where: { itemId: id, returnedAt: null },
  });
  if (activeCheckouts > 0) {
    return NextResponse.json(
      { error: `This item has ${activeCheckouts} active checkout(s). Return them before deleting.` },
      { status: 409 },
    );
  }

  await prisma.item.delete({ where: { id } });
  await logActivity({
    userId: session.user.id,
    action: "DELETE",
    entityType: "ITEM",
    entityId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
  return NextResponse.json({ ok: true });
}
