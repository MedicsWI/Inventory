// /api/dashboard — aggregated counts + lists for the home page
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const [itemCount, locationCount, expiringSoon, allItems, recentLogs] = await Promise.all([
    prisma.item.count(),
    prisma.location.count(),
    prisma.item.count({ where: { expirationDate: { lte: in30, gte: now } } }),
    prisma.item.findMany({
      select: { id: true, quantity: true, lowStockThreshold: true },
    }),
    prisma.activityLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const lowStockCount = allItems.filter(
    (i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold,
  ).length;

  // Same window as the count above — long-expired items were appearing in the
  // "expiring soon" sample while being excluded from the badge count.
  const expiringItems = await prisma.item.findMany({
    where: { expirationDate: { lte: in30, gte: now } },
    orderBy: { expirationDate: "asc" },
    take: 10,
    include: { location: { select: { id: true, name: true } }, category: true },
  });

  // Enrich recent activity with entity names so the dashboard shows "Aspirin 81mg"
  // instead of "item #abc12345".
  const itemIds = new Set<string>();
  const locationIds = new Set<string>();
  const categoryIds = new Set<string>();
  const userIds = new Set<string>();
  for (const log of recentLogs) {
    if (log.entityType === "ITEM") itemIds.add(log.entityId);
    else if (log.entityType === "LOCATION") locationIds.add(log.entityId);
    else if (log.entityType === "CATEGORY") categoryIds.add(log.entityId);
    else if (log.entityType === "USER") userIds.add(log.entityId);
  }
  const [items, locations, categories, users] = await Promise.all([
    itemIds.size
      ? prisma.item.findMany({ where: { id: { in: [...itemIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    locationIds.size
      ? prisma.location.findMany({ where: { id: { in: [...locationIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    categoryIds.size
      ? prisma.category.findMany({ where: { id: { in: [...categoryIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    userIds.size
      ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
  ]);
  const nameMap = new Map<string, string>();
  for (const i of items) nameMap.set(`ITEM:${i.id}`, i.name);
  for (const l of locations) nameMap.set(`LOCATION:${l.id}`, l.name);
  for (const c of categories) nameMap.set(`CATEGORY:${c.id}`, c.name);
  for (const u of users) nameMap.set(`USER:${u.id}`, u.name ?? u.email);

  const recentActivity = recentLogs.map((log) => {
    let entityName = nameMap.get(`${log.entityType}:${log.entityId}`) ?? null;
    if (!entityName && log.before && typeof log.before === "object" && !Array.isArray(log.before)) {
      const b = log.before as Record<string, unknown>;
      if (typeof b.name === "string") entityName = `${b.name} (deleted)`;
    }
    return { ...log, entityName };
  });

  return NextResponse.json({
    totals: {
      items: itemCount,
      locations: locationCount,
      expiringSoon,
      lowStock: lowStockCount,
    },
    expiringItems,
    recentActivity,
  });
}
