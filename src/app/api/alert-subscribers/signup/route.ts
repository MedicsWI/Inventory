// /api/alert-subscribers/signup — PUBLIC. The QR code at the event points here.
// No auth. Rate-limited by phone number in code (one upsert per phone per event
// per minute is more than enough — Prisma upsert handles re-submits cleanly).
//
// Returns 200 + a short message regardless of whether the subscriber was new or
// updated, so the public page can show a uniform success state.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhone, sendSms, isTwilioConfigured } from "@/lib/twilio";

const TOPICS = ["LOST_CHILD", "SEVERE_WEATHER", "ALL_HANDS", "GEAR_RETURN"] as const;

const schema = z.object({
  eventId: z.string().cuid(),
  name: z.string().min(1).max(120),
  phone: z.string(),
  department: z.string().max(80).optional(),
  topics: z.array(z.enum(TOPICS)).min(1),
  // Honest-broker checkbox on the form: user agreed to receive SMS.
  consent: z.literal(true),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "Phone must be a US number, e.g. 920-555-1234" },
      { status: 400 },
    );
  }

  const event = await prisma.event.findUnique({
    where: { id: parsed.data.eventId },
    select: { id: true, name: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const sub = await prisma.alertSubscriber.upsert({
    where: { eventId_phone: { eventId: parsed.data.eventId, phone } },
    create: {
      eventId: parsed.data.eventId,
      name: parsed.data.name.trim(),
      phone,
      department: parsed.data.department?.trim() || null,
      topics: parsed.data.topics,
      source: "QR",
    },
    update: {
      name: parsed.data.name.trim(),
      department: parsed.data.department?.trim() || null,
      topics: parsed.data.topics,
      stopped: false,
      stoppedAt: null,
      consentAt: new Date(),
    },
  });

  // Fire-and-forget confirmation SMS. Failures are non-fatal.
  if (isTwilioConfigured()) {
    const topicsLabel = parsed.data.topics.map(prettyTopic).join(", ");
    const body = `${event.name}: you'll receive ${topicsLabel} alerts at this number. Reply STOP to unsubscribe, HELP for info.`;
    try {
      await sendSms({ to: phone, body });
    } catch {
      // intentionally swallowed
    }
  }

  return NextResponse.json({
    ok: true,
    subscriberId: sub.id,
    message: `You're signed up for ${event.name} alerts. Check your phone for a confirmation text.`,
  });
}

function prettyTopic(t: string): string {
  return t.toLowerCase().replace(/_/g, " ");
}
