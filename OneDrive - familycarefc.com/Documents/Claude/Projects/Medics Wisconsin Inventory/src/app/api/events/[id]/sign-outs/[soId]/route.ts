// /api/events/[id]/sign-outs/[soId] — update person row or remove
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  personName: z.string().min(1).max(120).optional(),
  role: z.enum(["VOLUNTEER", "STAFF"]).optional(),
  userId: z.string().cuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  shifts: z.array(z.string().max(60)).optional(),
});

type Ctx = { params: Promise<{ id: string; soId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { soId } = await ctx.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.eventSignOut.update({
    where: { id: soId },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { soId } = await ctx.params;
  await prisma.eventSignOut.delete({ where: { id: soId } });
  return NextResponse.json({ ok: true });
}
