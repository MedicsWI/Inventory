// /api/items/import — CSV bulk import for items.
// Accepts JSON: { rows: ImportRow[] } where each row matches the documented columns.
// Upserts by barcode if provided; otherwise creates new rows.
// Resolves locationName / categoryName by case-insensitive lookup; creates missing
// categories on the fly, but NEVER auto-creates locations (too risky — names collide).
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const rowSchema = z.object({
  name: z.string().min(1).max(200),
  barcode: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  quantity: z.coerce.number().int().nonnegative().default(0),
  unit: z.string().optional().nullable(),
  lotNumber: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),    // YYYY-MM-DD or empty
  lowStockThreshold: z.union([z.coerce.number().int().nonnegative(), z.literal("")]).optional().nullable(),
  locationName: z.string().optional().nullable(),
  categoryName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
  createMissingCategories: z.boolean().default(true),
});

type RowResult = {
  index: number;
  status: "created" | "updated" | "skipped" | "error";
  name?: string;
  error?: string;
  id?: string;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "import:bulk"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Preload lookups
  const [locations, categories] = await Promise.all([
    prisma.location.findMany({ select: { id: true, name: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);
  const locByName = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  const results: RowResult[] = [];

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const raw = parsed.data.rows[i];
    const rowParse = rowSchema.safeParse(raw);
    if (!rowParse.success) {
      results.push({
        index: i,
        status: "error",
        error: rowParse.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
      });
      continue;
    }
    const r = rowParse.data;

    // Resolve location (do not auto-create)
    let locationId: string | null = null;
    if (r.locationName) {
      const found = locByName.get(r.locationName.toLowerCase());
      if (!found) {
        results.push({ index: i, status: "error", name: r.name, error: `Unknown location "${r.locationName}"` });
        continue;
      }
      locationId = found;
    }

    // Resolve / create category
    let categoryId: string | null = null;
    if (r.categoryName) {
      let found = catByName.get(r.categoryName.toLowerCase());
      if (!found && parsed.data.createMissingCategories) {
        const created = await prisma.category.create({ data: { name: r.categoryName } });
        catByName.set(created.name.toLowerCase(), created.id);
        found = created.id;
      }
      if (!found) {
        results.push({ index: i, status: "error", name: r.name, error: `Unknown category "${r.categoryName}"` });
        continue;
      }
      categoryId = found;
    }

    const expirationDate = r.expirationDate ? new Date(r.expirationDate) : null;
    if (r.expirationDate && expirationDate && isNaN(expirationDate.getTime())) {
      results.push({ index: i, status: "error", name: r.name, error: `Invalid expirationDate "${r.expirationDate}"` });
      continue;
    }

    const data = {
      name: r.name,
      barcode: r.barcode || null,
      sku: r.sku || null,
      quantity: r.quantity,
      unit: r.unit || null,
      lotNumber: r.lotNumber || null,
      expirationDate,
      lowStockThreshold:
        r.lowStockThreshold === undefined || r.lowStockThreshold === null || r.lowStockThreshold === ""
          ? null
          : Number(r.lowStockThreshold),
      notes: r.notes || null,
      locationId,
      categoryId,
    };

    try {
      if (r.barcode) {
        const upserted = await prisma.item.upsert({
          where: { barcode: r.barcode },
          create: data,
          update: data,
        });
        results.push({
          index: i,
          status: "updated",
          id: upserted.id,
          name: upserted.name,
        });
      } else {
        const created = await prisma.item.create({ data });
        results.push({ index: i, status: "created", id: created.id, name: created.name });
      }
    } catch (e) {
      results.push({
        index: i,
        status: "error",
        name: r.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const summary = {
    total: results.length,
    created: results.filter((r) => r.status === "created").length,
    updated: results.filter((r) => r.status === "updated").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  await logActivity({
    userId: session.user.id,
    action: "CREATE",
    entityType: "ITEM",
    entityId: "bulk-import",
    metadata: { summary },
  });

  return NextResponse.json({ summary, results });
}
