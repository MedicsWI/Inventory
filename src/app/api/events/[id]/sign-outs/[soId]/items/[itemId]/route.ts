// /api/events/[id]/sign-outs/[soId]/items/[itemId] — update or delete a single cycle
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  action: z.enum(["mark-in", "reset", "update"]).optional(),
  // Update fields:
  identifier: z.string().max(40).nullable().optional(),
  shift: z.string().max(60).nullable().optional(),
  initials: z.string().max(8).nullable().optional(),    // sets in OR out initials based on action
  photoUrl: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string; soId: string; itemId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await ctx.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.action === "mark-in") {
    const updated = await prisma.eventSignOutItem.update({
      where: { id: itemId },
      data: {
        inAt: new Date(),
        inInitials: parsed.data.initials ?? undefined,
        inPhotoUrl: parsed.data.photoUrl ?? undefined,
        notes: parsed.data.notes !== undefined ? parsed.data.notes : undefined,
      },
    });
    return NextResponse.json(updated);
  }

  if (parsed.data.action === "reset") {
    const updated = await prisma.eventSignOutItem.update({
      where: { id: itemId },
      data: {
        outAt: null,
        inAt: null,
        outInitials: null,
        inInitials: null,
        outPhotoUrl: null,
        inPhotoUrl: null,
      },
    });
    return NextResponse.json(updated);
  }

  // Generic update path (edit identifier / shift / notes after the fact)
  const updated = await prisma.eventSignOutItem.update({
    where: { id: itemId },
    data: {
      identifier: parsed.data.identifier !== undefined ? parsed.data.identifier : undefined,
      shift: parsed.data.shift !== undefined ? parsed.data.shift : undefined,
      notes: parsed.data.notes !== undefined ? parsed.data.notes : undefined,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { itemId } = await ctx.params;
  await prisma.eventSignOutItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}
