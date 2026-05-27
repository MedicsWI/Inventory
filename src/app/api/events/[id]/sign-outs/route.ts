// /api/events/[id]/sign-outs — add a person row to the event
//
// Two ways to add:
//   1. Pass { volunteerId } — link the sign-out to an existing Volunteer record.
//      personName is derived from the record. Preferred path for both medical
//      (RegPack-imported) and security (walk-ins added on the spot).
//   2. Pass { personName } — free-text add, no linkage. Kept for backward compat
//      and for the rare case where a person genuinely isn't a volunteer.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  personName: z.string().min(1).max(120).optional(),
  volunteerId: z.string().cuid().optional(),
  role: z.enum(["VOLUNTEER", "STAFF"]).default("VOLUNTEER"),
  userId: z.string().cuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  shifts: z.array(z.string().max(60)).default([]),
}).refine((d) => !!d.personName || !!d.volunteerId, {
  message: "Either personName or volunteerId is required",
  path: ["personName"],
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Resolve personName from Volunteer record if provided.
  let personName = parsed.data.personName ?? "";
  let volunteerId: string | null = null;
  if (parsed.data.volunteerId) {
    const v = await prisma.volunteer.findUnique({
      where: { id: parsed.data.volunteerId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!v) return NextResponse.json({ error: "Volunteer not found" }, { status: 404 });
    volunteerId = v.id;
    if (!personName) personName = `${v.firstName} ${v.lastName}`;
  }

  const created = await prisma.eventSignOut.create({
    data: {
      eventId: id,
      personName,
      role: parsed.data.role,
      userId: parsed.data.userId ?? null,
      volunteerId,
      notes: parsed.data.notes ?? null,
      shifts: parsed.data.shifts,
    },
    include: { items: true },
  });
  return NextResponse.json(created, { status: 201 });
}
