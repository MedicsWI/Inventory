// /api/orders/[id] — get, update status, delete
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const patchSchema = z.object({
  vendor: z.string().min(1).max(120).optional(),
  vendorEmail: z.union([z.string().email(), z.literal("")]).nullable().optional(),
  vendorContact: z.string().max(120).nullable().optional(),
  vendorPhone: z.string().max(40).nullable().optional(),
  orderNumber: z.string().nullable().optional(),
  trackingUrl: z.string().url().nullable().optional(),
  status: z.enum(["DRAFT", "ORDERED", "SHIPPED", "PARTIAL", "RECEIVED", "CANCELED"]).optional(),
  expectedAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  vendorNotes: z.string().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const order = await prisma.incomingOrder.findUnique({
    where: { id },
    include: { lines: { include: { item: { select: { id: true, name: true } } } } },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "import:bulk"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.incomingOrder.update({
    where: { id },
    data: {
      ...parsed.data,
      expectedAt:
        parsed.data.expectedAt === undefined
          ? undefined
          : parsed.data.expectedAt === null
            ? null
            : new Date(parsed.data.expectedAt),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "import:bulk"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const { id } = await ctx.params;
  await prisma.incomingOrder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
