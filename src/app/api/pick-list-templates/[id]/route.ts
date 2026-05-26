// /api/pick-list-templates/[id] — get, update (incl. item replace), delete
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

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().nullable().optional(),
  items: z.array(lineSchema).optional(),       // if provided, replaces the existing item set
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const t = await prisma.pickListTemplate.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { item: { name: "asc" } },
        include: { item: { select: { id: true, name: true, unit: true, quantity: true } } },
      },
    },
  });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:update"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { items, ...meta } = parsed.data;
  // If items array provided, replace wholesale
  if (items) {
    await prisma.$transaction(async (tx) => {
      await tx.pickListTemplateItem.deleteMany({ where: { templateId: id } });
      await tx.pickListTemplateItem.createMany({
        data: items.map((it) => ({
          templateId: id,
          itemId: it.itemId,
          quantity: it.quantity,
          notes: it.notes ?? null,
        })),
      });
      if (Object.keys(meta).length) {
        await tx.pickListTemplate.update({ where: { id }, data: meta });
      }
    });
  } else if (Object.keys(meta).length) {
    await prisma.pickListTemplate.update({ where: { id }, data: meta });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:delete"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const { id } = await ctx.params;
  await prisma.pickListTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
