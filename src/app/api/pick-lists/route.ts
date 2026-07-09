// /api/pick-lists — list + create
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const lineSchema = z.object({
  itemId: z.string().cuid(),
  requestedQty: z.number().int().positive().max(1_000_000),
  notes: z.string().max(2000).optional().nullable(),
});

const STATUSES = ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELED"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(120),
  fromLocationId: z.string().cuid().optional().nullable(),
  destination: z.string().max(120).optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  templateId: z.string().cuid().optional().nullable(),
  lines: z.array(lineSchema).default([]),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusRaw = searchParams.get("status")?.toUpperCase();
  // Validate — a bogus ?status= used to throw an unhandled Prisma 500.
  const status = STATUSES.find((s) => s === statusRaw);
  const mineOnly = searchParams.get("mine") === "1" || session.user.role === "MEDIC";

  const where: Parameters<typeof prisma.pickList.findMany>[0] = { where: {} };
  if (status) where.where = { ...where.where, status };
  if (mineOnly) where.where = { ...where.where, assignedToId: session.user.id };

  const rows = await prisma.pickList.findMany({
    ...where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      fromLocation: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      template: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Creating/assigning pick lists is manager work (matches stock counts).
  // Without this, a MEDIC could create a list they can't even view afterward.
  try { assertCan(session.user.role, "location:create"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { lines, templateId, ...meta } = parsed.data;

  // If a templateId is provided, hydrate lines from the template
  let finalLines = lines;
  if (templateId && lines.length === 0) {
    const tmpl = await prisma.pickListTemplate.findUnique({
      where: { id: templateId },
      include: { items: true },
    });
    if (!tmpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    finalLines = tmpl.items.map((ti) => ({
      itemId: ti.itemId,
      requestedQty: ti.quantity,
      notes: ti.notes ?? null,
    }));
  }

  // Dedupe by item — @@unique([pickListId, itemId]) would otherwise 500 (P2002).
  const byItem = new Map<string, { itemId: string; requestedQty: number; notes: string | null }>();
  for (const l of finalLines) {
    const prev = byItem.get(l.itemId);
    byItem.set(l.itemId, {
      itemId: l.itemId,
      requestedQty: (prev?.requestedQty ?? 0) + l.requestedQty,
      notes: l.notes ?? prev?.notes ?? null,
    });
  }

  const created = await prisma.pickList.create({
    data: {
      ...meta,
      templateId: templateId ?? null,
      lines: { create: [...byItem.values()] },
    },
    include: { lines: true },
  });
  return NextResponse.json(created, { status: 201 });
}
