// Twilio SMS sender — same pattern as Microsoft Graph email.
// Authenticates with Account SID + Auth Token via HTTP Basic, hits the
// REST API directly so we don't need the twilio npm package.

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    // Either a Messaging Service SID (preferred for A2P) or a single From number
    (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)
  );
}

// Strip everything but digits and +, then validate as E.164.
// Returns the cleaned number, or null if it doesn't look like a real one.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  // E.164: + followed by 7–15 digits. We require + to avoid accidental local numbers.
  if (!/^\+\d{7,15}$/.test(cleaned)) return null;
  return cleaned;
}

export async function sendSms(opts: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!isTwilioConfigured()) {
    return { ok: false, error: "Twilio not configured" };
  }

  const to = normalizePhone(opts.to);
  if (!to) {
    return { ok: false, error: "Invalid recipient phone number (expected E.164 like +14145551234)" };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({
    To: to,
    // SMS is 160 chars per segment. Truncate long alerts to keep it to ~2 segments.
    Body: opts.body.length > 320 ? opts.body.slice(0, 317) + "..." : opts.body,
  });
  // A2P-registered Messaging Service preferred. Falls back to single-number From.
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else if (from) params.set("From", from);
  else return { ok: false, error: "Neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_FROM_NUMBER set" };

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { sid?: string };
      return { ok: true, sid: json.sid };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Twilio ${res.status}: ${text.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
