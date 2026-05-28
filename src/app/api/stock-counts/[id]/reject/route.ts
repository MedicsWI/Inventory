// /api/stock-counts/[id]/reject — manager rejects a REVIEW count, sending it
// back to IN_PROGRESS for the counter to recount discrepancies. Nothing is
// applied to item quantities. Optional reason note is logged.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const schema = z.object({
  reason: z.string().max(500).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:update"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const count = await prisma.stockCount.findUnique({ where: { id }, select: { id: true, status: true, name: true } });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (count.status !== "REVIEW") {
    return NextResponse.json({ error: `Can only reject from REVIEW; this is ${count.status}.` }, { status: 400 });
  }

  await prisma.stockCount.update({
    where: { id },
    data: { status: "IN_PROGRESS" },
  });

  await logActivity({
    userId: session.user.id,
    action: "UPDATE",
    entityType: "STOCK_COUNT",
    entityId: id,
    metadata: {
      transition: "REVIEW->IN_PROGRESS",
      countName: count.name,
      reason: parsed.data.reason ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
