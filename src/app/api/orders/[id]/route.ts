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
  orderNumber: z.string().max(80).nullable().optional(),
  trackingUrl: z.string().url().nullable().optional(),
  // PARTIAL/RECEIVED only ever come from the receive routes (they move stock);
  // free-form writes desynced status from line state.
  status: z.enum(["ORDERED", "SHIPPED", "CANCELED"]).optional(),
  expectedAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  vendorNotes: z.string().max(4000).nullable().optional(),
});

// Allowed manual transitions. Receiving-driven states are owned by /receive.
const STATUS_TRANSITIONS: Record<string, string[]> = {
  ORDERED: ["DRAFT"], // mark ordered without emailing (phone order)
  SHIPPED: ["ORDERED", "PARTIAL"],
  CANCELED: ["DRAFT", "ORDERED", "SHIPPED", "PARTIAL"],
};

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
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = {
    ...parsed.data,
    // Normalize "" → null (POST does this; PATCH must match)
    vendorEmail: parsed.data.vendorEmail === "" ? null : parsed.data.vendorEmail,
    expectedAt:
      parsed.data.expectedAt === undefined
        ? undefined
        : parsed.data.expectedAt === null
          ? null
          : new Date(parsed.data.expectedAt),
  };

  if (data.status) {
    const allowedFrom = STATUS_TRANSITIONS[data.status] ?? [];
    const flipped = await prisma.incomingOrder.updateMany({
      where: { id, status: { in: allowedFrom as ("DRAFT" | "ORDERED" | "SHIPPED" | "PARTIAL")[] } },
      data,
    });
    if (flipped.count === 0) {
      const cur = await prisma.incomingOrder.findUnique({ where: { id }, select: { status: true } });
      if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(
        { error: `Can't move a ${cur.status} order to ${data.status}.` },
        { status: 409 },
      );
    }
    const updated = await prisma.incomingOrder.findUnique({ where: { id } });
    return NextResponse.json(updated);
  }

  const updated = await prisma.incomingOrder.update({ where: { id }, data });
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
