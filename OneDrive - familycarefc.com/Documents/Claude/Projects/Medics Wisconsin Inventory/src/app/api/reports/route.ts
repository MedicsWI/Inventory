// /api/reports — aggregate metrics for the reporting page
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const in60 = new Date(now.getTime() + 60 * 86400000);
  const in90 = new Date(now.getTime() + 90 * 86400000);

  const [byCategory, byLocation, expirationBuckets, totals, returnableStats] = await Promise.all([
    // Items grouped by category
    prisma.item.groupBy({
      by: ["categoryId"],
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    // Items grouped by location
    prisma.item.groupBy({
      by: ["locationId"],
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    // Expiration buckets: expired / <=30 / 31–60 / 61–90 / >90 / none
    Promise.all([
      prisma.item.count({ where: { expirationDate: { lt: now } } }),
      prisma.item.count({ where: { expirationDate: { gte: now, lte: in30 } } }),
      prisma.item.count({ where: { expirationDate: { gt: in30, lte: in60 } } }),
      prisma.item.count({ where: { expirationDate: { gt: in60, lte: in90 } } }),
      prisma.item.count({ where: { expirationDate: { gt: in90 } } }),
      prisma.item.count({ where: { expirationDate: null } }),
    ]).then(([expired, d30, d60, d90, beyond, none]) => ({ expired, d30, d60, d90, beyond, none })),
    // Top-line totals
    Promise.all([
      prisma.item.count(),
      prisma.item.aggregate({ _sum: { quantity: true } }),
      prisma.location.count(),
      prisma.category.count(),
      prisma.tag.count(),
    ]).then(([items, qtyAgg, locations, categories, tags]) => ({
      items,
      totalQuantity: qtyAgg._sum.quantity ?? 0,
      locations,
      categories,
      tags,
    })),
    // Returnable stats: how many marked returnable, how many currently out
    Promise.all([
      prisma.item.count({ where: { returnable: true } }),
      prisma.checkout.count({ where: { returnedAt: null } }),
      prisma.checkout.aggregate({ where: { returnedAt: null }, _sum: { quantity: true } }),
    ]).then(([returnableItems, activeCheckouts, outQty]) => ({
      returnableItems,
      activeCheckouts,
      totalOut: outQty._sum.quantity ?? 0,
    })),
  ]);

  // Resolve category and location names
  const [cats, locs] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.location.findMany({ select: { id: true, name: true } }),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const locName = new Map(locs.map((l) => [l.id, l.name]));

  return NextResponse.json({
    totals,
    returnableStats,
    expirationBuckets,
    byCategory: byCategory.map((g) => ({
      categoryId: g.categoryId,
      name: g.categoryId ? catName.get(g.categoryId) ?? "(missing)" : "(uncategorized)",
      itemCount: g._count._all,
      totalQty: g._sum.quantity ?? 0,
    })).sort((a, b) => b.itemCount - a.itemCount),
    byLocation: byLocation.map((g) => ({
      locationId: g.locationId,
      name: g.locationId ? locName.get(g.locationId) ?? "(missing)" : "(unassigned)",
      itemCount: g._count._all,
      totalQty: g._sum.quantity ?? 0,
    })).sort((a, b) => b.itemCount - a.itemCount),
  });
}
