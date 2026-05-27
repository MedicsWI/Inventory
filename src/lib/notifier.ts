// Notifier — fans out a notification to email + Teams webhook.
// Each channel is optional and silently skipped if not configured.
//
// Triggered from /api/notifications/check after Notification rows are written.
// Wrap each channel send in try/catch: a failing channel never blocks the others.

import nodemailer, { type Transporter } from "nodemailer";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { isGraphConfigured, sendViaGraph } from "@/lib/graph-mail";
import { isTwilioConfigured, sendSms } from "@/lib/twilio";

export type AlertChannelInputs = {
  // Logged-in user receiving this alert
  user: { id: string; name: string | null; email: string };
  // What we're alerting them about
  title: string;
  body?: string | null;
  // Optional link back into the app
  linkUrl?: string;
  // Severity hint for styling (Teams card color)
  severity?: "info" | "warning" | "critical";
};

let transporterCache: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (transporterCache) return transporterCache;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  transporterCache = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,        // STARTTLS on 587, TLS on 465
    auth: { user, pass },
  });
  return transporterCache;
}

// Either Graph OR SMTP being configured is enough to send mail.
export function isEmailConfigured(): boolean {
  return isGraphConfigured() ||
    !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export function emailMode(): "graph" | "smtp" | "none" {
  if (isGraphConfigured()) return "graph";
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) return "smtp";
  return "none";
}

// Shared sender used by both alerts and the PO email route.
// Picks Graph first, falls back to SMTP, returns a uniform result shape.
export async function sendEmail(opts: {
  to: string;
  cc?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const mode = emailMode();
  if (mode === "graph") {
    return sendViaGraph(opts);
  }
  if (mode === "smtp") {
    const t = getTransporter();
    if (!t) return { ok: false, error: "SMTP transporter unavailable" };
    try {
      const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
      await t.sendMail({
        from,
        to: opts.to,
        cc: opts.cc,
        replyTo: opts.replyTo,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: false, error: "No email transport configured" };
}

export function isTeamsConfigured(): boolean {
  return !!(process.env.TEAMS_ALERTS_EMAIL || process.env.TEAMS_WEBHOOK_URL);
}

export function teamsMode(): "email" | "webhook" | "none" {
  if (process.env.TEAMS_ALERTS_EMAIL) return "email";
  if (process.env.TEAMS_WEBHOOK_URL) return "webhook";
  return "none";
}

export function isPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function isSmsConfigured(): boolean {
  return isTwilioConfigured();
}

// Configure web-push once (lazy)
let webPushConfigured = false;
function ensureWebPushConfig(): boolean {
  if (webPushConfigured) return true;
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT_EMAIL ?? "mailto:inventory-alerts@medicswisconsin.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  webPushConfigured = true;
  return true;
}

export async function sendEmailAlert(input: AlertChannelInputs): Promise<{ ok: boolean; error?: string }> {
  const subject = `[Medics WI Inventory] ${input.title}`;
  const text = [
    input.title,
    input.body ?? "",
    input.linkUrl ? `\nView in app: ${input.linkUrl}` : "",
    "\n— Medics WI Inventory · automated alert. Do not reply.",
  ].filter(Boolean).join("\n");

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#111">
      <div style="font-size:12px;color:#666;letter-spacing:0.05em;text-transform:uppercase">
        ${severityLabel(input.severity)}
      </div>
      <h2 style="margin:8px 0 12px;font-size:18px">${escapeHtml(input.title)}</h2>
      ${input.body ? `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(input.body)}</p>` : ""}
      ${input.linkUrl ? `<p style="margin:0 0 12px"><a href="${input.linkUrl}" style="background:#0ea5e9;color:#fff;text-decoration:none;padding:8px 14px;border-radius:6px;display:inline-block">View in app</a></p>` : ""}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
      <p style="font-size:11px;color:#666;margin:0">
        Medics Wisconsin · Inventory<br/>
        Automated alert. Review and verify before acting.
      </p>
    </div>
  `;

  return sendEmail({ to: input.user.email, subject, html, text });
}

export async function sendTeamsAlert(input: AlertChannelInputs): Promise<{ ok: boolean; error?: string }> {
  // Preferred: send to the channel's email address (Teams renders it as a post).
  // This sidesteps Microsoft's webhook OAuth churn entirely.
  const channelEmail = process.env.TEAMS_ALERTS_EMAIL;
  if (channelEmail) {
    const subject = `[Medics WI] ${input.title}`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#111">
        <div style="font-size:12px;color:#666;letter-spacing:0.05em;text-transform:uppercase">
          ${severityLabel(input.severity)}
        </div>
        <h2 style="margin:8px 0 12px;font-size:18px">${escapeHtml(input.title)}</h2>
        ${input.body ? `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(input.body)}</p>` : ""}
        ${input.linkUrl ? `<p style="margin:0 0 12px"><a href="${input.linkUrl}" style="background:#0ea5e9;color:#fff;text-decoration:none;padding:8px 14px;border-radius:6px;display:inline-block">View in app</a></p>` : ""}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
        <p style="font-size:11px;color:#666;margin:0">Medics WI Inventory · automated alert</p>
      </div>
    `;
    const text = `${input.title}${input.body ? "\n\n" + input.body : ""}${input.linkUrl ? "\n\n" + input.linkUrl : ""}`;
    return sendEmail({ to: channelEmail, subject, html, text });
  }

  // Legacy webhook path (kept for tenants where channel email is disabled).
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return { ok: false, error: "Teams not configured" };
  try {
    // Adaptive Card v1.4 payload (works for both Incoming Webhook and Workflows endpoints)
    const themeColor =
      input.severity === "critical" ? "DC2626" :
      input.severity === "warning"  ? "F59E0B" : "0EA5E9";

    const payload = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          contentUrl: null,
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: severityLabel(input.severity),
                weight: "Bolder",
                color: input.severity === "critical" ? "Attention" : input.severity === "warning" ? "Warning" : "Accent",
                size: "Small",
                isSubtle: true,
              },
              { type: "TextBlock", text: input.title, weight: "Bolder", size: "Medium", wrap: true },
              ...(input.body ? [{ type: "TextBlock", text: input.body, wrap: true, isSubtle: true }] : []),
              {
                type: "TextBlock",
                text: `For ${input.user.name ?? input.user.email}`,
                size: "Small",
                isSubtle: true,
                spacing: "Small",
              },
            ],
            actions: input.linkUrl
              ? [{ type: "Action.OpenUrl", title: "View in app", url: input.linkUrl }]
              : [],
          },
        },
      ],
      // Legacy MessageCard fallback fields (some endpoints honor these instead of the Adaptive Card)
      "@type": "MessageCard",
      themeColor,
      summary: input.title,
      title: input.title,
      text: input.body ?? undefined,
      potentialAction: input.linkUrl
        ? [{ "@type": "OpenUri", name: "View in app", targets: [{ os: "default", uri: input.linkUrl }] }]
        : undefined,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `Teams ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Fan a single alert out to every push subscription belonging to a user.
// Returns counts of successful sends and how many dead subscriptions we cleaned up.
export async function sendPushAlert(
  input: AlertChannelInputs,
): Promise<{ ok: boolean; sent: number; removed: number; error?: string }> {
  if (!ensureWebPushConfig()) return { ok: false, sent: 0, removed: 0, error: "VAPID not configured" };

  const subs = await prisma.pushSubscription.findMany({ where: { userId: input.user.id } });
  if (subs.length === 0) return { ok: false, sent: 0, removed: 0, error: "No subscriptions for user" };

  const payload = JSON.stringify({
    title: `[Medics WI] ${input.title}`,
    body: input.body ?? "",
    url: input.linkUrl ?? "/notifications",
    tag: input.title.slice(0, 64),
  });

  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      // 404/410 means the browser dropped the subscription — drop the row.
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
        removed++;
      }
      // Otherwise keep the row; transient errors will pass on the next run.
    }
  }
  return { ok: sent > 0, sent, removed };
}

export async function sendSmsAlert(
  input: AlertChannelInputs & { phone: string | null | undefined },
): Promise<{ ok: boolean; error?: string }> {
  if (!isSmsConfigured()) return { ok: false, error: "Twilio not configured" };
  if (!input.phone) return { ok: false, error: "User has no phone number on file" };

  // Keep SMS body short — recipients pay attention to short, clear messages.
  // Format: [Medics WI] {title}. Optional shortened body. Optional link.
  const parts: string[] = [`[Medics WI] ${input.title}`];
  if (input.body) parts.push(input.body);
  if (input.linkUrl) parts.push(input.linkUrl);
  const body = parts.join(" — ");

  return sendSms({ to: input.phone, body });
}

function severityLabel(s?: AlertChannelInputs["severity"]): string {
  switch (s) {
    case "critical": return "EXPIRED / OUT OF STOCK";
    case "warning": return "WARNING";
    default: return "NOTICE";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
