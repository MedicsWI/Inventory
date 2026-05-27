// /api/volunteers — list + create
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { normalizePhone } from "@/lib/twilio";
import type { CredLevel, VolunteerType, Prisma } from "@prisma/client";

const CRED_LEVELS = [
  "EMR", "EMT", "AEMT", "PARAMEDIC", "RN", "LPN", "MD", "DO", "PA", "NP",
  "SECURITY", "POLICE", "FIRE", "CHAPLAIN", "OTHER",
] as const;

const createSchema = z.object({
  type: z.enum(["MEDICAL", "SECURITY"]),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  state: z.string().length(2).nullable().optional(),
  dob: z.string().datetime().nullable().optional(),
  shirtSize: z.string().nullable().optional(),
  credLevel: z.enum(CRED_LEVELS).nullable().optional(),
  credNumber: z.string().nullable().optional(),
  credExpiresAt: z.string().datetime().nullable().optional(),
  credVerified: z.boolean().optional(),
  cartWaiverSigned: z.boolean().optional(),
  emailListOptIn: z.boolean().optional(),
  welcomeEmailSent: z.boolean().optional(),
  camping: z.boolean().optional(),
  shiftCount: z.number().int().nullable().optional(),
  returning: z.boolean().optional(),
  idPictureUrl: z.string().url().nullable().optional(),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const type = searchParams.get("type") as VolunteerType | null;
  const verifiedParam = searchParams.get("verified"); // "yes" | "no" | null
  const expiringSoon = searchParams.get("expiringSoon") === "1";

  const where: Prisma.VolunteerWhereInput = {};
  if (type === "MEDICAL" || type === "SECURITY") where.type = type;
  if (verifiedParam === "yes") where.credVerified = true;
  if (verifiedParam === "no") where.credVerified = false;
  if (expiringSoon) {
    const in30 = new Date(Date.now() + 30 * 86400000);
    where.credExpiresAt = { lte: in30 };
  }
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const volunteers = await prisma.volunteer.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });
  return NextResponse.json(volunteers);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Normalize phones to E.164
  const data = { ...parsed.data } as z.infer<typeof createSchema>;
  if (data.phone) {
    const norm = normalizePhone(data.phone);
    if (!norm) return NextResponse.json({ error: "Phone must be E.164 (+14145551234)" }, { status: 400 });
    data.phone = norm;
  }
  if (data.emergencyContactPhone) {
    const norm = normalizePhone(data.emergencyContactPhone);
    if (!norm) return NextResponse.json({ error: "Emergency contact phone must be E.164" }, { status: 400 });
    data.emergencyContactPhone = norm;
  }

  const created = await prisma.volunteer.create({
    data: {
      ...data,
      state: data.state?.toUpperCase() ?? null,
      dob: data.dob ? new Date(data.dob) : null,
      credExpiresAt: data.credExpiresAt ? new Date(data.credExpiresAt) : null,
      credLevel: (data.credLevel ?? null) as CredLevel | null,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
