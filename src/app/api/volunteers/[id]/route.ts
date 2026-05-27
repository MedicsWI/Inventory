// /api/volunteers/[id] — get / update / delete one volunteer
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { normalizePhone } from "@/lib/twilio";
import type { CredLevel } from "@prisma/client";

const CRED_LEVELS = [
  "EMR", "EMT", "AEMT", "PARAMEDIC", "RN", "LPN", "MD", "DO", "PA", "NP",
  "SECURITY", "POLICE", "FIRE", "CHAPLAIN", "OTHER",
] as const;

const patchSchema = z.object({
  type: z.enum(["MEDICAL", "SECURITY"]).optional(),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
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

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const v = await prisma.volunteer.findUnique({
    where: { id },
    include: {
      credVerifiedBy: { select: { id: true, name: true, email: true } },
      signOuts: {
        select: { id: true, event: { select: { id: true, name: true, startsAt: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(v);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = { ...parsed.data } as z.infer<typeof patchSchema>;
  if (data.phone) {
    const norm = normalizePhone(data.phone);
    if (!norm) return NextResponse.json({ error: "Phone must be E.164" }, { status: 400 });
    data.phone = norm;
  }
  if (data.emergencyContactPhone) {
    const norm = normalizePhone(data.emergencyContactPhone);
    if (!norm) return NextResponse.json({ error: "Emergency contact phone must be E.164" }, { status: 400 });
    data.emergencyContactPhone = norm;
  }

  // Auto-stamp verification metadata when credVerified flips true
  const existing = await prisma.volunteer.findUnique({
    where: { id }, select: { credVerified: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const verificationFields: { credVerifiedById?: string; credVerifiedAt?: Date } = {};
  if (data.credVerified === true && !existing.credVerified) {
    verificationFields.credVerifiedById = session.user.id;
    verificationFields.credVerifiedAt = new Date();
  } else if (data.credVerified === false && existing.credVerified) {
    // Unverifying clears the audit stamp
    verificationFields.credVerifiedById = undefined;
    verificationFields.credVerifiedAt = undefined;
  }

  const updated = await prisma.volunteer.update({
    where: { id },
    data: {
      ...data,
      state: data.state?.toUpperCase() ?? data.state,
      dob: data.dob ? new Date(data.dob) : data.dob,
      credExpiresAt: data.credExpiresAt ? new Date(data.credExpiresAt) : data.credExpiresAt,
      credLevel: (data.credLevel ?? data.credLevel) as CredLevel | null | undefined,
      ...verificationFields,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  await prisma.volunteer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
