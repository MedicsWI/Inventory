// /api/event-templates/[id]/spawn — create a fresh Event instance from a template.
// User picks a calendar date; we combine the date with each shift's HH:MM time
// to produce concrete shift datetimes.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(1).max(120).optional(),    // defaults to template name + date
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  notes: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

// Build a local-time Date from "YYYY-MM-DD" + "HH:MM"
function combine(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:create"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tmpl = await prisma.eventTemplate.findUnique({
    where: { id },
    include: { shifts: { orderBy: { sortOrder: "asc" } } },
  });
  if (!tmpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Earliest shift start becomes the event's startsAt (if any shift has a time)
  const concreteShifts = tmpl.shifts.map((s) => ({
    ...s,
    startsAt: s.startsAtTime ? combine(parsed.data.date, s.startsAtTime) : null,
    endsAt: s.endsAtTime ? combine(parsed.data.date, s.endsAtTime) : null,
  }));
  const earliestStart = concreteShifts
    .map((s) => s.startsAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const latestEnd = concreteShifts
    .map((s) => s.endsAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  // Date label for the auto-name
  const [yy, mm, dd] = parsed.data.date.split("-");
  const dateLabel = `${mm}/${dd}/${yy}`;
  const defaultName = `${tmpl.name} · ${dateLabel}`;

  const created = await prisma.event.create({
    data: {
      name: parsed.data.name ?? defaultName,
      description: tmpl.description,
      location: tmpl.location,
      notes: parsed.data.notes ?? tmpl.notes,
      gearCategories: tmpl.gearCategories === null ? undefined : (tmpl.gearCategories as unknown as string[]),
      startsAt: earliestStart ?? combine(parsed.data.date, "00:00"),
      endsAt: latestEnd ?? null,
      templateId: tmpl.id,
      shifts: {
        create: concreteShifts.map((s) => ({
          name: s.name,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          sortOrder: s.sortOrder,
        })),
      },
    },
    include: { shifts: true },
  });

  return NextResponse.json(created, { status: 201 });
}
