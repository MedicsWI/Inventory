// /api/activity — audit log feed, enriched with entity name where possible.
// Returns the full before / after / metadata payload so consumers (item history page)
// can render proper diffs.
//
// Query params (all optional):
//   take=N            — page size (max 1000)
//   skip=N            — offset for pagination
//   entityType=ITEM   — filter by single type (also accepts CSV: ITEM,LOCATION)
//   entityId=...      — filter to one entity
//   action=CREATE     — filter by action (also accepts CSV: CREATE,UPDATE,DELETE)
//   userId=...        — filter by who performed the action
//   q=foo             — search by entity name (substring, case-insensitive)
//   since=ISO         — only entries >= this timestamp
//   until=ISO         — only entries <= this timestamp
//   format=csv        — return text/csv instead of JSON
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ActivityAction, EntityType, Prisma } from "@prisma/client";

const ENTITY_TYPES = ["ITEM", "LOCATION", "CATEGORY", "USER", "CHECKOUT", "STOCK_COUNT", "INCOMING_ORDER", "PICK_LIST"] as const;
const ACTIONS = [
  "CREATE", "UPDATE", "DELETE", "MOVE", "SCAN", "ADJUST_QTY",
  "LOGIN", "LOGOUT", "CHECKOUT", "RETURN",
  "STOCK_COUNT_START", "STOCK_COUNT_APPROVE",
  "ORDER_RECEIVE", "ORDER_SEND",
  "PICK_LIST_START", "PICK_LIST_COMPLETE",
] as const;

function parseCsvParam<T extends string>(value: string | null, valid: readonly T[]): T[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean);
  const valids = parts.filter((p): p is T => (valid as readonly string[]).includes(p));
  return valids.length > 0 ? valids : undefined;
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");
  const isCsv = format === "csv";
  const take = isCsv
    ? Math.min(Number(searchParams.get("take") ?? 10_000), 50_000)
    : Math.min(Number(searchParams.get("take") ?? 100), 1000);
  const skip = Math.max(Number(searchParams.get("skip") ?? 0), 0);

  const entityTypes = parseCsvParam(searchParams.get("entityType"), ENTITY_TYPES);
  const entityId = searchParams.get("entityId") || undefined;
  const actions = parseCsvParam(searchParams.get("action"), ACTIONS);
  const userId = searchParams.get("userId") || undefined;
  const since = parseDate(searchParams.get("since"));
  const until = parseDate(searchParams.get("until"));
  const q = searchParams.get("q")?.trim();

  const where: Prisma.ActivityLogWhereInput = {
    ...(entityTypes ? { entityType: { in: entityTypes as EntityType[] } } : {}),
    ...(entityId ? { entityId } : {}),
    ...(actions ? { action: { in: actions as ActivityAction[] } } : {}),
    ...(userId ? { userId } : {}),
    ...(since || until
      ? { createdAt: { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) } }
      : {}),
  };

  // Entity-name search is post-fetch (names come from related tables, not from the log row).
  // To support q without scanning all rows, we cap the pre-filter window at take * 5.
  const fetchTake = q ? Math.min(take * 5, 50_000) : take;

  const [total, logs] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: fetchTake,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  // Batch-fetch entity names for friendly display.
  const itemIds = new Set<string>();
  const locationIds = new Set<string>();
  const categoryIds = new Set<string>();
  const userIdsForName = new Set<string>();
  for (const log of logs) {
    if (log.entityType === "ITEM") itemIds.add(log.entityId);
    else if (log.entityType === "LOCATION") locationIds.add(log.entityId);
    else if (log.entityType === "CATEGORY") categoryIds.add(log.entityId);
    else if (log.entityType === "USER") userIdsForName.add(log.entityId);
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
    userIdsForName.size
      ? prisma.user.findMany({ where: { id: { in: [...userIdsForName] } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
  ]);

  const nameMap = new Map<string, string>();
  for (const i of items) nameMap.set(`ITEM:${i.id}`, i.name);
  for (const l of locations) nameMap.set(`LOCATION:${l.id}`, l.name);
  for (const c of categories) nameMap.set(`CATEGORY:${c.id}`, c.name);
  for (const u of users) nameMap.set(`USER:${u.id}`, u.name ?? u.email);

  let enriched = logs.map((log) => {
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

  // Post-fetch name search (works on the friendly name we just resolved).
  if (q) {
    const needle = q.toLowerCase();
    enriched = enriched.filter(
      (r) =>
        (r.entityName && r.entityName.toLowerCase().includes(needle)) ||
        (r.user?.name && r.user.name.toLowerCase().includes(needle)) ||
        (r.user?.email && r.user.email.toLowerCase().includes(needle)),
    );
    enriched = enriched.slice(0, take);
  }

  if (isCsv) {
    const csv = toCsv(enriched);
    const filename = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({ rows: enriched, total, skip, take });
}

function toCsv(rows: {
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  user?: { name?: string | null; email?: string | null } | null;
  metadata?: unknown;
}[]): string {
  const header = ["timestamp", "user_name", "user_email", "action", "entity_type", "entity_name", "entity_id", "metadata"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      new Date(r.createdAt).toISOString(),
      r.user?.name ?? "",
      r.user?.email ?? "",
      r.action,
      r.entityType,
      r.entityName ?? "",
      r.entityId,
      r.metadata ? JSON.stringify(r.metadata) : "",
    ].map(escapeCsv);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
