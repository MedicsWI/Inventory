// /api/dashboard/attention — items that need a human decision in the next 7 days.
// Surfaces are time-sensitive triage points; cheap to compute. No PII beyond names.
//
// Returns:
//   urgentExpiring   — items expiring in <= 7 days (or already expired)
//   lowStock         — items at or below their lowStockThreshold
//   stalledCounts    — stock counts stuck in REVIEW for >3 days
//   latePickLists    — assigned-to-me pick lists not yet completed
//   lateOrders       — incoming orders past their expected arrival date
//
// Each list capped at 5 — the dashboard panel surfaces a count + sample, with
// a "View all" link to the source page for full lists.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CAP = 5;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const role = session.user.role;
  const isAdmin = role === "ADMIN" || role === "MANAGER";

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);

  // Run them in parallel — each is a small query.
  const [
    urgentExpiringRows,
    urgentExpiringCount,
    allItems,
    stalledCountsRows,
    stalledCountsTotal,
    latePickListRows,
    latePickListsTotal,
    lateOrdersRows,
    lateOrdersTotal,
  ] = await Promise.all([
    prisma.item.findMany({
      where: { expirationDate: { lte: in7 } },
      orderBy: { expirationDate: "asc" },
      take: CAP,
      select: { id: true, name: true, quantity: true, unit: true, expirationDate: true },
    }),
    prisma.item.count({ where: { expirationDate: { lte: in7 } } }),
    prisma.item.findMany({
      where: { lowStockThreshold: { not: null } },
      select: { id: true, name: true, quantity: true, unit: true, lowStockThreshold: true },
    }),
    isAdmin
      ? prisma.stockCount.findMany({
          where: { status: "REVIEW", updatedAt: { lte: threeDaysAgo } },
          orderBy: { updatedAt: "asc" },
          take: CAP,
          select: { id: true, name: true, updatedAt: true },
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.stockCount.count({
          where: { status: "REVIEW", updatedAt: { lte: threeDaysAgo } },
        })
      : Promise.resolve(0),
    prisma.pickList.findMany({
      where: {
        assignedToId: userId,
        status: { in: ["DRAFT", "IN_PROGRESS"] },
      },
      orderBy: { createdAt: "asc" },
      take: CAP,
      select: { id: true, name: true, status: true, createdAt: true },
    }),
    prisma.pickList.count({
      where: {
        assignedToId: userId,
        status: { in: ["DRAFT", "IN_PROGRESS"] },
      },
    }),
    isAdmin
      ? prisma.incomingOrder.findMany({
          where: {
            status: { in: ["ORDERED", "SHIPPED", "PARTIAL"] },
            expectedAt: { lte: now },
          },
          orderBy: { expectedAt: "asc" },
          take: CAP,
          select: { id: true, vendor: true, orderNumber: true, expectedAt: true, status: true },
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.incomingOrder.count({
          where: {
            status: { in: ["ORDERED", "SHIPPED", "PARTIAL"] },
            expectedAt: { lte: now },
          },
        })
      : Promise.resolve(0),
  ]);

  const lowStockItems = allItems
    .filter((i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold)
    .sort((a, b) => a.quantity - b.quantity);
  const lowStockTotal = lowStockItems.length;
  const lowStockSample = lowStockItems.slice(0, CAP).map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    lowStockThreshold: i.lowStockThreshold!,
  }));

  return NextResponse.json({
    urgentExpiring: {
      total: urgentExpiringCount,
      sample: urgentExpiringRows.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        expirationDate: i.expirationDate,
        daysOut: i.expirationDate
          ? Math.ceil((i.expirationDate.getTime() - now.getTime()) / 86400000)
          : null,
      })),
    },
    lowStock: { total: lowStockTotal, sample: lowStockSample },
    stalledCounts: { total: stalledCountsTotal, sample: stalledCountsRows },
    latePickLists: { total: latePickListsTotal, sample: latePickListRows },
    lateOrders: { total: lateOrdersTotal, sample: lateOrdersRows },
  });
}
