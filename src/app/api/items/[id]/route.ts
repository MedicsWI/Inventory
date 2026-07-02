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
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  quantity: z.number().int().nonnegative().optional(),
  unit: z.string().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
  expirationDate: z.string().datetime().nullable().optional(),
  lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
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
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Quantity-only update is allowed for MEDIC; full updates require item:update
  const isQuantityOnly =
    Object.keys(parsed.data).length === 1 && Object.keys(parsed.data)[0] === "quantity";
  try {
    assertCan(session.user.role, isQuantityOnly ? "item:adjust-qty" : "item:update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const before = await prisma.item.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { tagIds, ...rest } = parsed.data;
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
