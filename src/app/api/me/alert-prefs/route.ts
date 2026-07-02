// /api/me/alert-prefs — the signed-in user's own alert preferences.
// Replaces the old /api/me/alerts (removed with the Phase 7/8 ops-hub cutover);
// this one covers only inventory alerts (expiration + low stock) and channels.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/twilio";

const patchSchema = z.object({
  receiveExpirationAlerts: z.boolean().optional(),
  receiveLowStockAlerts: z.boolean().optional(),
  receiveAlertsByEmail: z.boolean().optional(),
  receiveAlertsByTeams: z.boolean().optional(),
  receiveAlertsByPush: z.boolean().optional(),
  receiveAlertsBySms: z.boolean().optional(),
  phone: z.string().nullable().optional(),
});

const SELECT = {
  receiveExpirationAlerts: true,
  receiveLowStockAlerts: true,
  receiveAlertsByEmail: true,
  receiveAlertsByTeams: true,
  receiveAlertsByPush: true,
  receiveAlertsBySms: true,
  phone: true,
  role: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: SELECT,
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = { ...parsed.data };
  if (data.phone) {
    const norm = normalizePhone(data.phone);
    if (!norm) {
      return NextResponse.json({ error: "Phone must be a US number, e.g. 920-555-1234" }, { status: 400 });
    }
    data.phone = norm;
  }
  if (data.receiveAlertsBySms === true) {
    const phone = data.phone ?? (await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true },
    }))?.phone;
    if (!phone) {
      return NextResponse.json({ error: "Add a phone number to enable SMS alerts." }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: SELECT,
  });
  return NextResponse.json(updated);
}
