// /api/stock-counts — list + create
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  locationId: z.string().cuid().optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const mineOnly = searchParams.get("mine") === "1";

  const where: Parameters<typeof prisma.stockCount.findMany>[0] = { where: {} };
  if (status) where.where = { ...where.where, status: status as "DRAFT" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CANCELED" };
  if (mineOnly || session.user.role === "MEDIC") {
    where.where = { ...where.where, assignedToId: session.user.id };
  }

  const rows = await prisma.stockCount.findMany({
    ...where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      location: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      _count: { select: { lines: true } },
      // Pull just enough line data to compute discrepancy summaries for the list page.
      lines: { select: { expectedQty: true, actualQty: true } },
    },
  });

  // Compute lightweight discrepancy summaries per row so the list shows them
  // without each card making its own query.
  const enriched = rows.map((row) => {
    const discrepancyCount = row.lines.filter(
      (l) => l.actualQty != null && l.actualQty !== l.expectedQty,
    ).length;
    const unitsOff = row.lines.reduce((sum, l) => {
      if (l.actualQty == null) return sum;
      return sum + Math.abs(l.actualQty - l.expectedQty);
    }, 0);
    const { lines: _, ...rest } = row;
    return { ...rest, discrepancyCount, unitsOff };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:create"); }       // managers + admins can create counts
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const created = await prisma.stockCount.create({ data: parsed.data });
  return NextResponse.json(created, { status: 201 });
}
