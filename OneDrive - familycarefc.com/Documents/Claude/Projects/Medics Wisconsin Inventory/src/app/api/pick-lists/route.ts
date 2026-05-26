// /api/pick-lists — list + create
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const lineSchema = z.object({
  itemId: z.string().cuid(),
  requestedQty: z.number().int().positive(),
  notes: z.string().optional().nullable(),
});

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
  const status = searchParams.get("status") || undefined;
  const mineOnly = searchParams.get("mine") === "1" || session.user.role === "MEDIC";

  const where: Parameters<typeof prisma.pickList.findMany>[0] = { where: {} };
  if (status) where.where = { ...where.where, status: status as "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELED" };
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

  const body = await req.json();
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

  const created = await prisma.pickList.create({
    data: {
      ...meta,
      templateId: templateId ?? null,
      lines: {
        create: finalLines.map((l) => ({
          itemId: l.itemId,
          requestedQty: l.requestedQty,
          notes: l.notes ?? null,
        })),
      },
    },
    include: { lines: true },
  });
  return NextResponse.json(created, { status: 201 });
}
