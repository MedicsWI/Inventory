// /api/export/[kind] — stream a CSV of the requested data set.
// kinds: items | expiring | low-stock | activity | checkouts
import { NextResponse } from "next/server";
import Papa from "papaparse";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

type Ctx = { params: Promise<{ kind: string }> };

// Exports containing other users' data (all borrowers, full audit log) are
// manager/admin only — mirrors the MEDIC own-rows scoping on /api/checkouts.
const RESTRICTED_KINDS = new Set(["checkouts", "activity"]);

export async function GET(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind } = await ctx.params;
  if (RESTRICTED_KINDS.has(kind)) {
    try { assertCan(session.user.role, "import:bulk"); }
    catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  }
  const { searchParams } = new URL(req.url);

  let rows: Record<string, unknown>[] = [];
  let filename = `medics-wi-${kind}.csv`;

  switch (kind) {
    case "items": {
      const items = await prisma.item.findMany({
        include: { location: true, category: true },
        orderBy: { name: "asc" },
      });
      rows = items.map((i) => ({
        name: i.name,
        barcode: i.barcode ?? "",
        sku: i.sku ?? "",
        quantity: i.quantity,
        unit: i.unit ?? "",
        lotNumber: i.lotNumber ?? "",
        expirationDate: i.expirationDate ? i.expirationDate.toISOString().slice(0, 10) : "",
        lowStockThreshold: i.lowStockThreshold ?? "",
        returnable: i.returnable ? "yes" : "",
        locationName: i.location?.name ?? "",
        categoryName: i.category?.name ?? "",
        notes: i.notes ?? "",
      }));
      filename = `medics-wi-items-${todayStamp()}.csv`;
      break;
    }
    case "expiring": {
      const days = Number(searchParams.get("days") ?? 30);
      const cutoff = new Date(Date.now() + days * 86400000);
      const items = await prisma.item.findMany({
        where: { expirationDate: { lte: cutoff } },
        include: { location: true, category: true },
        orderBy: { expirationDate: "asc" },
      });
      rows = items.map((i) => ({
        name: i.name,
        location: i.location?.name ?? "",
        category: i.category?.name ?? "",
        lotNumber: i.lotNumber ?? "",
        quantity: i.quantity,
        expirationDate: i.expirationDate ? i.expirationDate.toISOString().slice(0, 10) : "",
        daysUntilExpiration: i.expirationDate
          ? Math.ceil((i.expirationDate.getTime() - Date.now()) / 86400000)
          : "",
      }));
      filename = `medics-wi-expiring-${days}d-${todayStamp()}.csv`;
      break;
    }
    case "low-stock": {
      const items = await prisma.item.findMany({
        where: { lowStockThreshold: { not: null } },
        include: { location: true, category: true },
        orderBy: { name: "asc" },
      });
      const filtered = items.filter(
        (i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold,
      );
      rows = filtered.map((i) => ({
        name: i.name,
        location: i.location?.name ?? "",
        category: i.category?.name ?? "",
        quantity: i.quantity,
        threshold: i.lowStockThreshold ?? "",
        unit: i.unit ?? "",
        barcode: i.barcode ?? "",
      }));
      filename = `medics-wi-low-stock-${todayStamp()}.csv`;
      break;
    }
    case "activity": {
      const take = Math.min(Number(searchParams.get("take") ?? 1000), 5000);
      const logs = await prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take,
        include: { user: { select: { name: true, email: true } } },
      });
      rows = logs.map((l) => ({
        when: l.createdAt.toISOString(),
        user: l.user?.name ?? l.user?.email ?? "",
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
      }));
      filename = `medics-wi-activity-${todayStamp()}.csv`;
      break;
    }
    case "checkouts": {
      const rowsDb = await prisma.checkout.findMany({
        orderBy: { checkedOutAt: "desc" },
        include: {
          item: { select: { name: true, sku: true } },
          user: { select: { name: true, email: true } },
        },
      });
      rows = rowsDb.map((c) => ({
        item: c.item.name,
        sku: c.item.sku ?? "",
        quantity: c.quantity,
        borrower: c.user.name ?? c.user.email,
        checkedOutAt: c.checkedOutAt.toISOString(),
        expectedReturnAt: c.expectedReturnAt ? c.expectedReturnAt.toISOString() : "",
        returnedAt: c.returnedAt ? c.returnedAt.toISOString() : "",
        status: c.returnedAt ? "returned" : "active",
        notes: c.notes ?? "",
      }));
      filename = `medics-wi-checkouts-${todayStamp()}.csv`;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown export kind" }, { status: 400 });
  }

  // Same data, two formats — ?format=json for clients building PDFs
  if (searchParams.get("format") === "json") {
    const columns = rows[0] ? Object.keys(rows[0]) : [];
    return NextResponse.json({
      title: kind,
      filename: filename.replace(/\.csv$/, ".pdf"),
      columns,
      rows: rows.map((r) => columns.map((c) => r[c] ?? "")),
    });
  }

  const csv = Papa.unparse(rows, { header: true });
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
