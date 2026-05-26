// /api/pick-list-templates — list + create
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const lineSchema = z.object({
  itemId: z.string().cuid(),
  quantity: z.number().int().positive(),
  notes: z.string().optional().nullable(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional().nullable(),
  items: z.array(lineSchema).default([]),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.pickListTemplate.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:create"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { items, ...meta } = parsed.data;
  const created = await prisma.pickListTemplate.create({
    data: {
      ...meta,
      items: {
        create: items.map((it) => ({
          itemId: it.itemId,
          quantity: it.quantity,
          notes: it.notes ?? null,
        })),
      },
    },
    include: { items: true },
  });
  return NextResponse.json(created, { status: 201 });
}
