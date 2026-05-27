// /api/volunteers/missing-data-alert — daily digest of volunteers missing required data.
//
// Required fields differ by volunteer type:
//   MEDICAL:  dob, emergencyContact (name+phone), shirtSize, credLevel, credNumber,
//             credExpiresAt, credVerified, cartWaiverSigned, welcomeEmailSent
//   SECURITY: dob, emergencyContact (name+phone), shirtSize, cartWaiverSigned,
//             welcomeEmailSent  (no license required)
//
// Always tracked for both: expired or expiring-soon credentials.
//
// Two callers:
//   1. Vercel Cron with Bearer CRON_SECRET header
//   2. Signed-in admin/manager hitting "Send test digest now" (cookie auth)

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/notifier";

type VolunteerLite = {
  id: string;
  type: "MEDICAL" | "SECURITY";
  firstName: string;
  lastName: string;
  email: string;
  dob: Date | null;
  shirtSize: string | null;
  credLevel: string | null;
  credNumber: string | null;
  credExpiresAt: Date | null;
  credVerified: boolean;
  cartWaiverSigned: boolean;
  welcomeEmailSent: boolean;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

function missingFieldsFor(v: VolunteerLite): string[] {
  const out: string[] = [];
  if (!v.dob) out.push("DOB");
  if (!v.shirtSize) out.push("Shirt size");
  if (!v.emergencyContactName) out.push("Emergency contact name");
  if (!v.emergencyContactPhone) out.push("Emergency contact phone");
  if (!v.cartWaiverSigned) out.push("Cart waiver");
  if (!v.welcomeEmailSent) out.push("Welcome email");

  if (v.type === "MEDICAL") {
    if (!v.credLevel) out.push("License level");
    if (!v.credNumber) out.push("License number");
    if (!v.credExpiresAt) out.push("License expiration");
    if (!v.credVerified) out.push("License NOT verified");
  }
  return out;
}

function expirationStatus(v: VolunteerLite, now: Date): "expired" | "soon" | "ok" | "none" {
  if (!v.credExpiresAt) return "none";
  const ms = v.credExpiresAt.getTime() - now.getTime();
  if (ms < 0) return "expired";
  if (ms <= 30 * 86400000) return "soon";
  return "ok";
}

export async function POST(req: Request) {
  const session = await auth();
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const cronAuthorized = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  if (!session && !cronAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const volunteers = await prisma.volunteer.findMany({
    select: {
      id: true,
      type: true,
      firstName: true,
      lastName: true,
      email: true,
      dob: true,
      shirtSize: true,
      credLevel: true,
      credNumber: true,
      credExpiresAt: true,
      credVerified: true,
      cartWaiverSigned: true,
      welcomeEmailSent: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
    },
    orderBy: [{ type: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  type Row = {
    v: VolunteerLite;
    missing: string[];
    expStatus: "expired" | "soon" | "ok" | "none";
  };

  const flagged: Row[] = [];
  for (const v of volunteers) {
    const missing = missingFieldsFor(v as VolunteerLite);
    const expStatus = expirationStatus(v as VolunteerLite, now);
    if (missing.length > 0 || expStatus === "expired" || expStatus === "soon") {
      flagged.push({ v: v as VolunteerLite, missing, expStatus });
    }
  }

  // Build the rows grouped by type
  const medical = flagged.filter((r) => r.v.type === "MEDICAL");
  const security = flagged.filter((r) => r.v.type === "SECURITY");

  // If everything is clean, only send when an admin manually triggers; cron stays silent.
  if (flagged.length === 0 && cronAuthorized) {
    return NextResponse.json({ sent: false, reason: "All volunteers complete — no digest needed." });
  }

  const appBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXTAUTH_URL ?? "";
  const link = (id: string) => (appBase ? `${appBase}/volunteers/${id}` : `/volunteers/${id}`);

  const recipientsRaw = (process.env.VOLUNTEER_DIGEST_RECIPIENTS ?? "").trim();
  let recipients: string[];
  if (recipientsRaw) {
    recipients = recipientsRaw.split(/[;,]\s*/).map((s) => s.trim()).filter(Boolean);
  } else {
    // Fallback: every ADMIN/MANAGER
    const users = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] } },
      select: { email: true },
    });
    recipients = users.map((u) => u.email);
  }
  if (recipients.length === 0) {
    return NextResponse.json({ sent: false, reason: "No recipients configured." });
  }

  const dateStr = now.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const subject = `[Medics WI] Volunteer data digest — ${dateStr} (${flagged.length} flagged)`;

  const text = buildText({ medical, security, link, now, dateStr });
  const html = buildHtml({ medical, security, link, now, dateStr, total: volunteers.length });

  const results: { to: string; ok: boolean; error?: string }[] = [];
  for (const to of recipients) {
    const r = await sendEmail({ to, subject, html, text });
    results.push({ to, ok: r.ok, error: r.error });
  }

  return NextResponse.json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    totalVolunteers: volunteers.length,
    flagged: flagged.length,
    medicalCount: medical.length,
    securityCount: security.length,
    results,
  });
}

export async function GET(req: Request) {
  return POST(req);
}

// ---------- formatters ----------

function buildText(opts: {
  medical: { v: VolunteerLite; missing: string[]; expStatus: "expired" | "soon" | "ok" | "none" }[];
  security: { v: VolunteerLite; missing: string[]; expStatus: "expired" | "soon" | "ok" | "none" }[];
  link: (id: string) => string;
  now: Date;
  dateStr: string;
}): string {
  const { medical, security, link, now, dateStr } = opts;
  const lines: string[] = [];
  lines.push(`Medics WI — Volunteer data digest (${dateStr})`);
  lines.push("");
  lines.push(`Medical flagged: ${medical.length}`);
  lines.push(`Security flagged: ${security.length}`);
  lines.push("");

  function section(name: string, rows: typeof medical) {
    lines.push(`--- ${name} ---`);
    if (rows.length === 0) {
      lines.push("  (none)");
      lines.push("");
      return;
    }
    for (const { v, missing, expStatus } of rows) {
      const exp = formatExp(v.credExpiresAt, expStatus, now);
      const fields = missing.length > 0 ? missing.join(", ") : "—";
      lines.push(`  ${v.lastName}, ${v.firstName}  <${v.email}>`);
      lines.push(`    Missing: ${fields}`);
      if (exp) lines.push(`    ${exp}`);
      lines.push(`    Edit: ${link(v.id)}`);
    }
    lines.push("");
  }

  section("MEDICAL", medical);
  section("SECURITY", security);

  lines.push("— Medics WI Inventory · automated digest. Verify before acting.");
  return lines.join("\n");
}

function buildHtml(opts: {
  medical: { v: VolunteerLite; missing: string[]; expStatus: "expired" | "soon" | "ok" | "none" }[];
  security: { v: VolunteerLite; missing: string[]; expStatus: "expired" | "soon" | "ok" | "none" }[];
  link: (id: string) => string;
  now: Date;
  dateStr: string;
  total: number;
}): string {
  const { medical, security, link, now, dateStr, total } = opts;

  const tableFor = (rows: typeof medical) => {
    if (rows.length === 0) {
      return `<p style="margin:8px 0 16px;color:#666;font-style:italic">All complete.</p>`;
    }
    const trs = rows
      .map(({ v, missing, expStatus }) => {
        const exp = formatExpHtml(v.credExpiresAt, expStatus, now);
        const missingHtml =
          missing.length === 0
            ? `<span style="color:#666">—</span>`
            : missing
                .map(
                  (m) =>
                    `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;display:inline-block;margin:1px;font-size:11px">${escapeHtml(m)}</span>`,
                )
                .join(" ");
        return `
          <tr>
            <td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top">
              <a href="${link(v.id)}" style="color:#0ea5e9;text-decoration:none;font-weight:600">
                ${escapeHtml(v.lastName)}, ${escapeHtml(v.firstName)}
              </a>
              <div style="font-size:11px;color:#666">${escapeHtml(v.email)}</div>
            </td>
            <td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top">${missingHtml}</td>
            <td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top;white-space:nowrap">${exp}</td>
          </tr>`;
      })
      .join("");
    return `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;font-size:11px;text-transform:uppercase;color:#374151">
            <th style="padding:8px">Volunteer</th>
            <th style="padding:8px">Missing fields</th>
            <th style="padding:8px">License</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>`;
  };

  return `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:760px;margin:0 auto;padding:16px;color:#111">
      <div style="font-size:12px;color:#666;letter-spacing:0.05em;text-transform:uppercase">Daily digest</div>
      <h2 style="margin:8px 0 4px;font-size:20px">Volunteer data digest — ${escapeHtml(dateStr)}</h2>
      <p style="margin:0 0 16px;color:#374151;font-size:13px">
        ${medical.length + security.length} of ${total} volunteers need attention
        (${medical.length} medical, ${security.length} security).
      </p>

      <h3 style="margin:20px 0 6px;font-size:15px;color:#0ea5e9">Medical (${medical.length})</h3>
      ${tableFor(medical)}

      <h3 style="margin:20px 0 6px;font-size:15px;color:#0ea5e9">Security (${security.length})</h3>
      ${tableFor(security)}

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
      <p style="font-size:11px;color:#666;margin:0">
        Medics Wisconsin · Inventory<br/>
        Automated daily digest. Click a name to open the volunteer record.
      </p>
    </div>
  `;
}

function formatExp(d: Date | null, status: "expired" | "soon" | "ok" | "none", now: Date): string {
  if (!d) return "";
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  const date = d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  if (status === "expired") return `License EXPIRED (${date}, ${Math.abs(days)}d ago)`;
  if (status === "soon") return `License expires in ${days}d (${date})`;
  return "";
}

function formatExpHtml(
  d: Date | null,
  status: "expired" | "soon" | "ok" | "none",
  now: Date,
): string {
  if (!d) return `<span style="color:#999">—</span>`;
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  const date = d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  if (status === "expired") {
    return `<span style="color:#dc2626;font-weight:600">EXPIRED</span><br/><span style="font-size:11px;color:#666">${escapeHtml(date)} (${Math.abs(days)}d)</span>`;
  }
  if (status === "soon") {
    return `<span style="color:#d97706;font-weight:600">${days}d</span><br/><span style="font-size:11px;color:#666">${escapeHtml(date)}</span>`;
  }
  return `<span style="font-size:11px;color:#666">${escapeHtml(date)}</span>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
