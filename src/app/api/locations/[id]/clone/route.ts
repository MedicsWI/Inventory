// /api/locations/[id]/clone — duplicate a location (bag/kit/box) and its
// contents so building "Trauma Bag 2" from "Trauma Bag 1" is one click.
//
// What copies: the location tree (sub-locations included), each item's
// name/description/sku/category/tags/unit/quantity/low-stock threshold/
// returnable/photo/notes.
// What does NOT copy (unique or physical-stock-specific):
//   - location + item barcodes (unique — print new labels for the new bag)
//   - tile_device_id (one tracker per physical asset)
//   - lotNumber / expirationDate (the new bag gets stocked with different lots)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const schema = z.object({
  name: z.string().min(1).max(120),
});

type Ctx = { params: Promise<{ id: string }> };

const MAX_LOCATIONS = 100;
const MAX_ITEMS = 2000;

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:create"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const source = await prisma.location.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Collect the whole subtree (one query, walk in memory).
  const all = await prisma.location.findMany({ select: { id: true, parentId: true } });
  const childrenOf = new Map<string, string[]>();
  for (const l of all) {
    if (!l.parentId) continue;
    const arr = childrenOf.get(l.parentId) ?? [];
    arr.push(l.id);
    childrenOf.set(l.parentId, arr);
  }
  const subtreeIds: string[] = [id];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const kid of childrenOf.get(cur) ?? []) {
      subtreeIds.push(kid);
      stack.push(kid);
    }
  }
  if (subtreeIds.length > MAX_LOCATIONS) {
    return NextResponse.json(
      { error: `Tree too large to clone (${subtreeIds.length} locations, max ${MAX_LOCATIONS}).` },
      { status: 400 },
    );
  }

  const [locations, items] = await Promise.all([
    prisma.location.findMany({ where: { id: { in: subtreeIds } } }),
    prisma.item.findMany({
      where: { locationId: { in: subtreeIds } },
      include: { tags: { select: { id: true } } },
    }),
  ]);
  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Too many items to clone (${items.length}, max ${MAX_ITEMS}).` },
      { status: 400 },
    );
  }

  const locById = new Map(locations.map((l) => [l.id, l]));

  let newRootId = "";
  let itemsCloned = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // Clone locations parent-first so parentId references exist.
      const idMap = new Map<string, string>(); // old id → new id
      const order = [...subtreeIds]; // built root-first above
      for (const oldId of order) {
        const src = locById.get(oldId);
        if (!src) continue;
        const created = await tx.location.create({
          data: {
            name: oldId === id ? parsed.data.name : src.name,
            type: src.type,
            notes: src.notes,
            barcode: null, // unique — print a fresh label for the clone
            parentId:
              oldId === id
                ? src.parentId // clone sits next to the original
                : idMap.get(src.parentId ?? "") ?? null,
          },
        });
        idMap.set(oldId, created.id);
        if (oldId === id) newRootId = created.id;
      }

      for (const item of items) {
        if (!item.locationId) continue;
        const newLocationId = idMap.get(item.locationId);
        if (!newLocationId) continue;
        await tx.item.create({
          data: {
            name: item.name,
            description: item.description,
            sku: item.sku,
            quantity: item.quantity,
            unit: item.unit,
            lowStockThreshold: item.lowStockThreshold,
            notes: item.notes,
            photoUrl: item.photoUrl,
            returnable: item.returnable,
            categoryId: item.categoryId,
            locationId: newLocationId,
            // barcode / tileDeviceId are unique per physical thing — left empty.
            // lotNumber / expirationDate describe the ORIGINAL stock — left empty.
            ...(item.tags.length
              ? { tags: { connect: item.tags.map((t) => ({ id: t.id })) } }
              : {}),
          },
        });
        itemsCloned++;
      }
    }, { timeout: 30_000 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Clone failed" },
      { status: 500 },
    );
  }

  await logActivity({
    userId: session.user.id,
    action: "CREATE",
    entityType: "LOCATION",
    entityId: newRootId,
    metadata: {
      clonedFrom: id,
      clonedFromName: source.name,
      locations: subtreeIds.length,
      items: itemsCloned,
    },
  });

  return NextResponse.json(
    { ok: true, id: newRootId, locations: subtreeIds.length, items: itemsCloned },
    { status: 201 },
  );
}
