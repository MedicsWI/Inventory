// /api/orders — list + create incoming (vendor) orders
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const lineSchema = z.object({
  itemId: z.string().cuid().nullable().optional(),
  name: z.string().min(1).max(200),
  sku: z.string().optional().nullable(),
  expectedQty: z.number().int().positive(),
  unitCost: z.number().nonnegative().nullable().optional(),
});

const createSchema = z.object({
  vendor: z.string().min(1).max(120),
  vendorEmail: z.string().email().optional().nullable().or(z.literal("")),
  vendorContact: z.string().max(120).optional().nullable(),
  vendorPhone: z.string().max(40).optional().nullable(),
  orderNumber: z.string().optional().nullable(),
  trackingUrl: z.string().url().optional().nullable(),
  expectedAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  vendorNotes: z.string().optional().nullable(),
  status: z.enum(["DRAFT", "ORDERED"]).default("DRAFT"),    // create as DRAFT by default
  lines: z.array(lineSchema).min(1),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;

  const rows = await prisma.incomingOrder.findMany({
    where: status ? { status: status as "ORDERED" | "SHIPPED" | "PARTIAL" | "RECEIVED" | "CANCELED" } : {},
    orderBy: [{ status: "asc" }, { expectedAt: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { lines: true } } },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "import:bulk"); }       // managers + admins
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { lines, vendorEmail, ...meta } = parsed.data;
  const created = await prisma.incomingOrder.create({
    data: {
      ...meta,
      vendorEmail: vendorEmail || null,
      expectedAt: meta.expectedAt ? new Date(meta.expectedAt) : null,
      lines: {
        create: lines.map((l) => ({
          itemId: l.itemId ?? null,
          name: l.name,
          sku: l.sku ?? null,
          expectedQty: l.expectedQty,
          unitCost: l.unitCost ?? null,
        })),
      },
    },
    include: { lines: true },
  });
  return NextResponse.json(created, { status: 201 });
}
