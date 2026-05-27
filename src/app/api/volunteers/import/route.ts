// /api/volunteers/import — POST a CSV body, upsert volunteers by email.
// Britta exports from RegPack, drops the CSV here, we create / update records.
// Returns a per-row report so the caller can show what landed and what didn't.

import { NextResponse } from "next/server";
import Papa from "papaparse";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { normalizePhone } from "@/lib/twilio";
import type { CredLevel, VolunteerType, Prisma } from "@prisma/client";

const CRED_LEVEL_MAP: Record<string, CredLevel> = {
  "emr": "EMR",
  "emt": "EMT", "emt-b": "EMT", "emt-basic": "EMT", "emt basic": "EMT",
  "aemt": "AEMT", "advanced emt": "AEMT", "emt-i": "AEMT", "emt intermediate": "AEMT",
  "paramedic": "PARAMEDIC", "emt-p": "PARAMEDIC",
  "rn": "RN", "registered nurse": "RN",
  "lpn": "LPN", "licensed practical nurse": "LPN",
  "md": "MD", "physician": "MD",
  "do": "DO",
  "pa": "PA", "physician assistant": "PA",
  "np": "NP", "nurse practitioner": "NP",
  "security": "SECURITY",
  "police": "POLICE", "leo": "POLICE",
  "fire": "FIRE", "firefighter": "FIRE",
  "chaplain": "CHAPLAIN",
  "other": "OTHER",
};

// Parse Yes/No/True/False/1/0/blank into a strict boolean.
function parseYesNo(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

// Parse MM/DD/YYYY or YYYY-MM-DD into a Date, or null.
function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = v.trim();
  // MM/DD/YYYY
  const m1 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m1) {
    const [, mm, dd, yyyy] = m1;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  // YYYY-MM-DD
  const m2 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m2) {
    const [, yyyy, mm, dd] = m2;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeCredLevel(raw: unknown): CredLevel | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return CRED_LEVEL_MAP[key] ?? null;
}

type RowReport = {
  row: number;
  email: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const contentType = req.headers.get("content-type") ?? "";
  let csvText: string;
  if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
    csvText = await req.text();
  } else {
    const body = await req.json().catch(() => ({}));
    csvText = typeof body.csv === "string" ? body.csv : "";
  }
  if (!csvText.trim()) {
    return NextResponse.json({ error: "Empty CSV body" }, { status: 400 });
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  const reports: RowReport[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2; // header is row 1, data starts row 2
    const email = (row.email ?? "").trim().toLowerCase();
    const firstName = (row.first_name ?? "").trim();
    const lastName = (row.last_name ?? "").trim();
    const typeRaw = (row.type ?? "MEDICAL").trim().toUpperCase();
    const type: VolunteerType = typeRaw === "SECURITY" ? "SECURITY" : "MEDICAL";

    if (!email || !firstName || !lastName) {
      reports.push({ row: rowNum, email, status: "skipped", message: "Missing email, first_name, or last_name" });
      skipped++;
      continue;
    }

    const phone = row.phone ? normalizePhone(row.phone) : null;
    if (row.phone && !phone) {
      reports.push({ row: rowNum, email, status: "error", message: `Invalid phone: ${row.phone}` });
      errored++;
      continue;
    }
    const ecPhone = row.emergency_contact_phone ? normalizePhone(row.emergency_contact_phone) : null;
    if (row.emergency_contact_phone && !ecPhone) {
      reports.push({ row: rowNum, email, status: "error", message: `Invalid emergency contact phone: ${row.emergency_contact_phone}` });
      errored++;
      continue;
    }

    const data: Prisma.VolunteerUpsertArgs["create"] = {
      type,
      firstName,
      lastName,
      email,
      phone,
      state: row.state ? row.state.trim().toUpperCase().slice(0, 2) : null,
      dob: parseDate(row.dob),
      shirtSize: row.shirt_size?.trim() || null,
      credLevel: normalizeCredLevel(row.license_level),
      // Brian fills in credNumber / credExpiresAt / credVerified in-app — don't set from CSV.
      camping: parseYesNo(row.camping),
      shiftCount: row.shift_count ? Number(row.shift_count) || null : null,
      returning: (row.returning ?? "").trim().toLowerCase().startsWith("ret"),
      idPictureUrl: row.id_picture_url?.trim() || null,
      cartWaiverSigned: parseYesNo(row.cart_waiver),
      cartWaiverSignedAt: parseYesNo(row.cart_waiver) ? new Date() : null,
      emailListOptIn: parseYesNo(row.email_list),
      welcomeEmailSent: parseYesNo(row.welcome_email),
      welcomeEmailSentAt: parseYesNo(row.welcome_email) ? new Date() : null,
      emergencyContactName: row.emergency_contact_name?.trim() || null,
      emergencyContactPhone: ecPhone,
      notes: row.notes?.trim() || null,
    };

    try {
      const existing = await prisma.volunteer.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        // Upsert: update fields but never overwrite Brian's verification work
        await prisma.volunteer.update({
          where: { email },
          data: {
            ...data,
            // Keep existing cred verification stamps
            cartWaiverSignedAt: data.cartWaiverSigned ? undefined : null,
            welcomeEmailSentAt: data.welcomeEmailSent ? undefined : null,
          },
        });
        reports.push({ row: rowNum, email, status: "updated" });
        updated++;
      } else {
        await prisma.volunteer.create({ data });
        reports.push({ row: rowNum, email, status: "created" });
        created++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reports.push({ row: rowNum, email, status: "error", message: msg });
      errored++;
    }
  }

  return NextResponse.json({
    summary: { created, updated, skipped, errored, total: parsed.data.length },
    reports,
  });
}
