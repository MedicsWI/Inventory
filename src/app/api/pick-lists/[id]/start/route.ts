// /api/pick-lists/[id]/start — move from DRAFT → IN_PROGRESS
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const pl = await prisma.pickList.findUnique({ where: { id }, include: { lines: true } });
  if (!pl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pl.status !== "DRAFT") return NextResponse.json({ error: `Status is ${pl.status}` }, { status: 400 });
  if (pl.lines.length === 0) return NextResponse.json({ error: "No lines on this list." }, { status: 400 });
  // Medics can only start lists assigned to them (mirrors the complete route).
  if (session.user.role === "MEDIC" && pl.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.pickList.update({
    where: { id },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  await logActivity({
    userId: session.user.id,
    action: "PICK_LIST_START",
    entityType: "PICK_LIST",
    entityId: id,
    metadata: { lines: pl.lines.length },
  });
  return NextResponse.json(updated);
}
