// /api/activity — audit log feed, enriched with entity name where possible.
// Returns the full before / after / metadata payload so consumers (item history page)
// can render proper diffs.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const take = Math.min(Number(searchParams.get("take") ?? 100), 500);
  const entityType = searchParams.get("entityType") || undefined;
  const entityId = searchParams.get("entityId") || undefined;

  const logs = await prisma.activityLog.findMany({
    where: {
      ...(entityType ? { entityType: entityType as "ITEM" | "LOCATION" | "CATEGORY" | "USER" | "CHECKOUT" | "STOCK_COUNT" | "INCOMING_ORDER" } : {}),
      ...(entityId ? { entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  // Batch-fetch entity names for friendly display
  const itemIds = new Set<string>();
  const locationIds = new Set<string>();
  const categoryIds = new Set<string>();
  const userIds = new Set<string>();
  for (const log of logs) {
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

  const enriched = logs.map((log) => {
    let entityName = nameMap.get(`${log.entityType}:${log.entityId}`) ?? null;
    if (!entityName && log.before && typeof log.before === "object" && !Array.isArray(log.before)) {
      const b = log.before as Record<string, unknown>;
      if (typeof b.name === "string") entityName = `${b.name} (deleted)`;
    }
    return {
      id: log.id,
      createdAt: log.createdAt,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      entityName,
      before: log.before,
      after: log.after,
      metadata: log.metadata,
      user: log.user,
    };
  });

  return NextResponse.json(enriched);
}
