// /api/stock-counts/[id]/submit — counter marks the count ready for manager review
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const count = await prisma.stockCount.findUnique({ where: { id } });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (count.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Cannot submit a ${count.status} count.` }, { status: 400 });
  }
  if (session.user.role === "MEDIC" && count.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.stockCount.update({
    where: { id },
    data: { status: "REVIEW" },
  });
  return NextResponse.json(updated);
}
