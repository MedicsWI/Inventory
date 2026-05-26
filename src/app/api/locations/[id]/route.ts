// /api/locations/[id] — get, update (incl. move parentId), delete
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["STATION", "VEHICLE", "BOX", "KIT", "SHELF"]).optional(),
  parentId: z.string().cuid().nullable().optional(),
  barcode: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const loc = await prisma.location.findUnique({
    where: { id },
    include: {
      parent: true,
      children: true,
      items: { include: { category: true }, orderBy: { name: "asc" } },
    },
  });
  if (!loc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(loc);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertCan(session.user.role, "location:update");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Guard: prevent making a node its own descendant
  if (parsed.data.parentId) {
    if (parsed.data.parentId === id) {
      return NextResponse.json({ error: "A location cannot be its own parent" }, { status: 400 });
    }
    const descendantIds = await collectDescendantIds(id);
    if (descendantIds.has(parsed.data.parentId)) {
      return NextResponse.json({ error: "Cannot move into own subtree" }, { status: 400 });
    }
  }

  const before = await prisma.location.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await prisma.location.update({ where: { id }, data: parsed.data });

  const movedParent = parsed.data.parentId !== undefined && parsed.data.parentId !== before.parentId;
  await logActivity({
    userId: session.user.id,
    action: movedParent ? "MOVE" : "UPDATE",
    entityType: "LOCATION",
    entityId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(updated)),
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertCan(session.user.role, "location:delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const before = await prisma.location.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.location.delete({ where: { id } });
  await logActivity({
    userId: session.user.id,
    action: "DELETE",
    entityType: "LOCATION",
    entityId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
  return NextResponse.json({ ok: true });
}

async function collectDescendantIds(rootId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    const kids = await prisma.location.findMany({
      where: { parentId: cur },
      select: { id: true },
    });
    for (const k of kids) {
      out.add(k.id);
      stack.push(k.id);
    }
  }
  return out;
}
