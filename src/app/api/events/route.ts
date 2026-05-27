// /api/events — list + create
// GET accepts either a logged-in session OR an Ops Hub Bearer API key
// (so Ops Hub can populate its event picker before broadcasting an alert).
// POST stays cookie-only — Ops Hub doesn't create events.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { identifyCaller } from "@/lib/ops-hub-auth";

const shiftSchema = z.object({
  name: z.string().min(1).max(60),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  gearCategories: z.array(z.string().min(1).max(40)).default(["Shirt", "Radio", "Cart", "Bag"]),
  shifts: z.array(shiftSchema).default([]),
  templateId: z.string().cuid().optional().nullable(),
});

export async function GET(req: Request) {
  // Any logged-in user (cookie) OR Ops Hub Bearer key can list events.
  // identifyCaller covers ADMIN/MANAGER cookie + Ops Hub key. For MEDIC users
  // we fall back to plain session-presence check (same as before this change).
  const session = await auth();
  const caller = identifyCaller(req, session);
  if (!caller && !session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;

  const rows = await prisma.event.findMany({
    where: status ? { status: status as "PLANNED" | "ACTIVE" | "CLOSED" | "CANCELED" } : {},
    orderBy: [{ status: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { signOuts: true, shifts: true } },
      template: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:create"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { gearCategories, shifts, templateId, ...meta } = parsed.data;
  const created = await prisma.event.create({
    data: {
      ...meta,
      startsAt: meta.startsAt ? new Date(meta.startsAt) : null,
      endsAt: meta.endsAt ? new Date(meta.endsAt) : null,
      gearCategories,
      templateId: templateId ?? null,
      shifts: {
        create: shifts.map((s, i) => ({
          name: s.name,
          startsAt: s.startsAt ? new Date(s.startsAt) : null,
          endsAt: s.endsAt ? new Date(s.endsAt) : null,
          sortOrder: s.sortOrder ?? i,
        })),
      },
    },
    include: { shifts: true },
  });
  return NextResponse.json(created, { status: 201 });
}
