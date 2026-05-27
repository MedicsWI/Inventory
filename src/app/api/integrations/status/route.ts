// /api/integrations/status — returns which alert channels are configured.
// Safe to call from any signed-in user (just yes/no, no credentials leaked).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isEmailConfigured, isTeamsConfigured, isPushConfigured, isSmsConfigured, emailMode, teamsMode } from "@/lib/notifier";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    emailConfigured: isEmailConfigured(),
    emailMode: emailMode(),                  // "graph" | "smtp" | "none"
    teamsConfigured: isTeamsConfigured(),
    teamsMode: teamsMode(),                  // "email" | "webhook" | "none"
    teamsChannelEmail: process.env.TEAMS_ALERTS_EMAIL ?? null,
    pushConfigured: isPushConfigured(),
    smsConfigured: isSmsConfigured(),
    smsFromNumber: process.env.TWILIO_FROM_NUMBER ?? null,
    graphSendFrom: process.env.GRAPH_SEND_FROM ?? null,
    smtpHost: process.env.SMTP_HOST ?? null,
    smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? null,
  });
}
