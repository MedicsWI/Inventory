// /api/integrations/status — returns which alert channels are configured.
// Booleans/modes for everyone; actual addresses/hosts only for user:manage
// (infrastructure details don't belong in every medic's devtools).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isEmailConfigured, isTeamsConfigured, isPushConfigured, isSmsConfigured, emailMode, teamsMode } from "@/lib/notifier";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const base = {
    emailConfigured: isEmailConfigured(),
    emailMode: emailMode(),                  // "graph" | "smtp" | "none"
    teamsConfigured: isTeamsConfigured(),
    teamsMode: teamsMode(),                  // "email" | "webhook" | "none"
    pushConfigured: isPushConfigured(),
    smsConfigured: isSmsConfigured(),
  };
  if (!can(session.user.role, "user:manage")) return NextResponse.json(base);

  return NextResponse.json({
    ...base,
    teamsChannelEmail: process.env.TEAMS_ALERTS_EMAIL ?? null,
    smsFromNumber: process.env.TWILIO_FROM_NUMBER ?? null,
    graphSendFrom: process.env.GRAPH_SEND_FROM ?? null,
    smtpHost: process.env.SMTP_HOST ?? null,
    smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? null,
  });
}
