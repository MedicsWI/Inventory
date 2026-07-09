// /api/items — list + create
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { prismaErrorResponse } from "@/lib/api-errors";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  sku: z.string().max(120).optional().nullable(),
  barcode: z.string().max(200).optional().nullable(),
  quantity: z.number().int().nonnegative().max(1_000_000).default(0),
  unit: z.string().max(40).optional().nullable(),
  lotNumber: z.string().max(120).optional().nullable(),
  expirationDate: z.string().datetime().optional().nullable(),
  lowStockThreshold: z.number().int().nonnegative().max(1_000_000).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
  locationId: z.string().cuid().optional().nullable(),
  categoryId: z.string().cuid().optional().nullable(),
  returnable: z.boolean().optional(),
  tileDeviceId: z.string().optional().nullable(),
  tagIds: z.array(z.string().cuid()).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const locationId = searchParams.get("locationId") ?? undefined;
  const expiringWithin = Number(searchParams.get("expiringWithin") ?? "");
  const lowStock = searchParams.get("lowStock") === "1";

  const where: Parameters<typeof prisma.item.findMany>[0] = { where: {} };
  if (q) {
    where.where = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ],
    };
  }
  if (locationId) where.where = { ...where.where, locationId };
  if (searchParams.get("returnable") === "1") where.where = { ...where.where, returnable: true };
  if (!Number.isNaN(expiringWithin) && expiringWithin > 0) {
    const cutoff = new Date(Date.now() + expiringWithin * 24 * 60 * 60 * 1000);
    where.where = {
      ...where.where,
      expirationDate: { lte: cutoff, gt: new Date(Date.now() - 365 * 86400000) },
    };
  }

  // lowStock: narrow in SQL first — filtering AFTER take:200 silently missed
  // low-stock items once the table grew past 200 rows.
  if (lowStock) where.where = { ...where.where, lowStockThreshold: { not: null } };

  const items = await prisma.item.findMany({
    ...where,
    orderBy: [{ expirationDate: "asc" }, { name: "asc" }],
    include: { location: { select: { id: true, name: true } }, category: true },
    take: lowStock ? 2000 : 200,
  });

  const filtered = lowStock
    ? items.filter((i) => i.lowStockThreshold != null && i.quantity <= (i.lowStockThreshold ?? 0))
    : items;

  return NextResponse.json(filtered);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertCan(session.user.role, "item:create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tagIds, ...data } = parsed.data;
  let created;
  try {
    created = await prisma.item.create({
      data: {
        ...data,
        expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
        ...(tagIds?.length ? { tags: { connect: tagIds.map((id) => ({ id })) } } : {}),
      },
      include: { tags: true },
    });
  } catch (e) {
    const r = prismaErrorResponse(e);
    if (r) return r;
    throw e;
  }

  await logActivity({
    userId: session.user.id,
    action: "CREATE",
    entityType: "ITEM",
    entityId: created.id,
    after: JSON.parse(JSON.stringify(created)),
  });

  return NextResponse.json(created, { status: 201 });
}
