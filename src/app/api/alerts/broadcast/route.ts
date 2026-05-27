// /api/alerts/broadcast — send an SMS to every subscriber on (eventId, topic)
// who hasn't STOPped. Writes an Alert row + AlertSend per recipient for audit.
//
// Callers: ADMIN/MANAGER from this app (cookie session), or Ops Hub Dispatcher
// /Supervisor via Bearer OPSHUB_API_KEY (see /lib/ops-hub-auth).
//
// Returns: { alertId, total, queued, failed }

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSms, isTwilioConfigured } from "@/lib/twilio";
import { identifyCaller } from "@/lib/ops-hub-auth";

const TOPICS = ["LOST_CHILD", "SEVERE_WEATHER", "ALL_HANDS", "GEAR_RETURN"] as const;

const schema = z.object({
  eventId: z.string().cuid(),
  topic: z.enum(TOPICS),
  body: z.string().min(1).max(480),
  // For accidental-send protection: caller must echo the event name exactly.
  confirmEventName: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const session = await auth();
  const caller = identifyCaller(req, session);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured on this deployment" }, { status: 500 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({
    where: { id: parsed.data.eventId },
    select: { id: true, name: true, status: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.name.trim().toLowerCase() !== parsed.data.confirmEventName.trim().toLowerCase()) {
    return NextResponse.json(
      { error: "Confirmation event name does not match. Type the event name exactly." },
      { status: 400 },
    );
  }

  const subs = await prisma.alertSubscriber.findMany({
    where: {
      eventId: parsed.data.eventId,
      topics: { has: parsed.data.topic },
      stopped: false,
    },
    select: { id: true, phone: true, name: true },
  });

  if (subs.length === 0) {
    return NextResponse.json(
      { error: `No active subscribers for ${parsed.data.topic} at this event.` },
      { status: 400 },
    );
  }

  // Persist the alert first so a partial send still has an audit row.
  const alert = await prisma.alert.create({
    data: {
      eventId: parsed.data.eventId,
      topic: parsed.data.topic,
      body: parsed.data.body,
      sentById: caller.kind === "user" ? caller.userId : null,
      sentByLabel: caller.kind === "opshub" ? caller.label : null,
      recipientCount: subs.length,
    },
  });

  // Format: [Medics WI · Event] TOPIC — body
  const prefix = `[Medics WI · ${event.name}] ${prettyTopic(parsed.data.topic)} — `;
  const smsBody = (prefix + parsed.data.body).slice(0, 480);

  let queued = 0;
  let failed = 0;
  for (const s of subs) {
    const r = await sendSms({ to: s.phone, body: smsBody });
    await prisma.alertSend.create({
      data: {
        alertId: alert.id,
        subscriberId: s.id,
        phone: s.phone,
        status: r.ok ? "SENT" : "FAILED",
        twilioSid: r.sid ?? null,
        error: r.ok ? null : r.error ?? null,
      },
    });
    if (r.ok) queued++;
    else failed++;
  }

  return NextResponse.json({
    alertId: alert.id,
    total: subs.length,
    queued,
    failed,
    eventName: event.name,
    topic: parsed.data.topic,
  });
}

function prettyTopic(t: string): string {
  switch (t) {
    case "LOST_CHILD": return "LOST CHILD";
    case "SEVERE_WEATHER": return "WEATHER";
    case "ALL_HANDS": return "ALL HANDS";
    case "GEAR_RETURN": return "GEAR RETURN";
    default: return t;
  }
}
