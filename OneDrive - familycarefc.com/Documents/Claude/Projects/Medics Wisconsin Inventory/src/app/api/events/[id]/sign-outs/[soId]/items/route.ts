// /api/events/[id]/sign-outs/[soId]/items — manage gear cycles for a person
//
// POST: new cycle (OUT). Creates a new row in EventSignOutItem.
// PATCH: update an existing cycle (typically to mark IN, or fix details)
// DELETE: remove a specific cycle (mistake correction)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Create new cycle (someone tapping OUT)
const createSchema = z.object({
  category: z.string().min(1).max(40),
  shift: z.string().max(60).optional().nullable(),
  identifier: z.string().max(40).optional().nullable(),
  initials: z.string().max(8).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string; soId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { soId } = await ctx.params;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Refuse a new OUT if there's already an open cycle (out without in) for this category
  // — that's clearly a mistake; user should mark the previous one IN first.
  const open = await prisma.eventSignOutItem.findFirst({
    where: { signOutId: soId, category: parsed.data.category, inAt: null, outAt: { not: null } },
    select: { id: true },
  });
  if (open) {
    return NextResponse.json(
      { error: "There's already an open cycle for this gear. Mark it IN before signing out again." },
      { status: 400 },
    );
  }

  const created = await prisma.eventSignOutItem.create({
    data: {
      signOutId: soId,
      category: parsed.data.category,
      shift: parsed.data.shift ?? null,
      identifier: parsed.data.identifier ?? null,
      outAt: new Date(),
      outInitials: parsed.data.initials ?? null,
      outPhotoUrl: parsed.data.photoUrl ?? null,
      notes: parsed.data.notes ?? null,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
