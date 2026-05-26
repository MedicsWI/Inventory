// /api/event-templates — list + create
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

// "HH:MM" 24-hour format. Lets users say "09:00" / "15:30" instead of offset minutes.
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM 24-hour");

const shiftSchema = z.object({
  name: z.string().min(1).max(60),
  startsAtTime: timeOfDay.optional().nullable(),
  endsAtTime: timeOfDay.optional().nullable(),
  sortOrder: z.number().int().optional(),
});

const schema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  gearCategories: z.array(z.string().min(1).max(40)).default(["Shirt", "Radio", "Cart", "Bag"]),
  notes: z.string().optional().nullable(),
  shifts: z.array(shiftSchema).default([]),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.eventTemplate.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { shifts: true, spawned: true } } },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:create"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { shifts, ...meta } = parsed.data;
  const created = await prisma.eventTemplate.create({
    data: {
      ...meta,
      shifts: {
        create: shifts.map((s, i) => ({
          name: s.name,
          startsAtTime: s.startsAtTime ?? null,
          endsAtTime: s.endsAtTime ?? null,
          sortOrder: s.sortOrder ?? i,
        })),
      },
    },
    include: { shifts: true },
  });
  return NextResponse.json(created, { status: 201 });
}
