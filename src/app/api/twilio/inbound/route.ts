// /api/twilio/inbound — Twilio Messaging Service inbound webhook.
//
// Configure in Twilio Console: Messaging Service -> Integration -> Send inbound
// messages to a webhook -> https://inventory.medicswisconsin.com/api/twilio/inbound
//
// Twilio also handles STOP/HELP automatically at the messaging-service level
// (they stop delivering to opt-outs), but THIS route writes the opt-out to our
// own DB so the broadcast roster shows it and audit logs are accurate.
//
// Twilio posts application/x-www-form-urlencoded. Key fields used: From, Body.
// We respond with empty TwiML so Twilio doesn't try to send anything back.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const TWIML_HEADERS = { "Content-Type": "text/xml" };

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const HELP_WORDS = new Set(["help", "info"]);
const START_WORDS = new Set(["start", "yes", "unstop"]);

export async function POST(req: Request) {
  const form = await req.formData();
  const from = (form.get("From") as string | null)?.trim() ?? "";
  const bodyRaw = (form.get("Body") as string | null)?.trim() ?? "";
  const body = bodyRaw.toLowerCase();

  if (!from) {
    return new NextResponse(EMPTY_TWIML, { headers: TWIML_HEADERS });
  }

  // Stop — mark all of this phone's subscriptions stopped.
  if (STOP_WORDS.has(body)) {
    await prisma.alertSubscriber.updateMany({
      where: { phone: from },
      data: { stopped: true, stoppedAt: new Date() },
    });
    // Twilio sends the carrier-mandated opt-out reply automatically.
    return new NextResponse(EMPTY_TWIML, { headers: TWIML_HEADERS });
  }

  // Help — Twilio sends a default; we don't add extra to keep MMS charges off.
  if (HELP_WORDS.has(body)) {
    return new NextResponse(EMPTY_TWIML, { headers: TWIML_HEADERS });
  }

  // Re-subscribe.
  if (START_WORDS.has(body)) {
    await prisma.alertSubscriber.updateMany({
      where: { phone: from, stopped: true },
      data: { stopped: false, stoppedAt: null, consentAt: new Date() },
    });
    return new NextResponse(EMPTY_TWIML, { headers: TWIML_HEADERS });
  }

  // Anything else: ignore. We don't want a chatbot here.
  return new NextResponse(EMPTY_TWIML, { headers: TWIML_HEADERS });
}

// Twilio sometimes pings the URL with GET to validate it.
export async function GET() {
  return new NextResponse(EMPTY_TWIML, { headers: TWIML_HEADERS });
}
