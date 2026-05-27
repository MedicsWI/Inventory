// /api/alert-subscribers — list (admin / Ops Hub) + create (admin / Ops Hub)
//
// PUBLIC sign-up uses /api/alert-subscribers/signup (no auth required).
// This route is for admins managing the roster and for Ops Hub queries.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/twilio";
import { identifyCaller } from "@/lib/ops-hub-auth";
import type { AlertTopic, AlertSource } from "@prisma/client";

const TOPICS = ["LOST_CHILD", "SEVERE_WEATHER", "ALL_HANDS", "GEAR_RETURN"] as const;
const SOURCES = ["QR", "KIOSK", "VOLUNTEER", "ADMIN", "OPSHUB"] as const;

const createSchema = z.object({
  eventId: z.string().cuid(),
  name: z.string().min(1).max(120),
  phone: z.string(),
  department: z.string().max(80).nullable().optional(),
  topics: z.array(z.enum(TOPICS)).min(1),
  source: z.enum(SOURCES).optional(),
  volunteerId: z.string().cuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  const caller = identifyCaller(req, session);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const topic = searchParams.get("topic") as AlertTopic | null;
  const includeStopped = searchParams.get("includeStopped") === "1";

  const subs = await prisma.alertSubscriber.findMany({
    where: {
      ...(eventId ? { eventId } : {}),
      ...(topic ? { topics: { has: topic } } : {}),
      ...(includeStopped ? {} : { stopped: false }),
    },
    orderBy: [{ name: "asc" }],
    take: 1000,
  });

  return NextResponse.json(subs);
}

export async function POST(req: Request) {
  const session = await auth();
  const caller = identifyCaller(req, session);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "Phone must be a valid E.164 number" }, { status: 400 });

  // Upsert by (eventId, phone) so a re-scan just refreshes the topic list.
  const source: AlertSource =
    parsed.data.source ?? (caller.kind === "opshub" ? "OPSHUB" : "ADMIN");

  const sub = await prisma.alertSubscriber.upsert({
    where: { eventId_phone: { eventId: parsed.data.eventId, phone } },
    create: {
      eventId: parsed.data.eventId,
      name: parsed.data.name,
      phone,
      department: parsed.data.department ?? null,
      topics: parsed.data.topics,
      source,
      volunteerId: parsed.data.volunteerId ?? null,
      notes: parsed.data.notes ?? null,
    },
    update: {
      name: parsed.data.name,
      department: parsed.data.department ?? null,
      topics: parsed.data.topics,
      // Re-subscribing un-stops you (but logs the consent timestamp again).
      stopped: false,
      stoppedAt: null,
      consentAt: new Date(),
      ...(parsed.data.volunteerId ? { volunteerId: parsed.data.volunteerId } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    },
  });

  return NextResponse.json(sub, { status: 201 });
}
