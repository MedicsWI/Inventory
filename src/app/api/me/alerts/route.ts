// /api/me/alerts — read + update my own notification preferences
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/twilio";

const schema = z.object({
  receiveExpirationAlerts: z.boolean().optional(),
  receiveLowStockAlerts: z.boolean().optional(),
  receiveAlertsByEmail: z.boolean().optional(),
  receiveAlertsByTeams: z.boolean().optional(),
  receiveAlertsByPush: z.boolean().optional(),
  receiveAlertsBySms: z.boolean().optional(),
  phone: z.string().nullable().optional(),
});

const selectFields = {
  receiveExpirationAlerts: true,
  receiveLowStockAlerts: true,
  receiveAlertsByEmail: true,
  receiveAlertsByTeams: true,
  receiveAlertsByPush: true,
  receiveAlertsBySms: true,
  phone: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: selectFields,
  });
  return NextResponse.json(user ?? {});
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Normalize the phone before storing so all rows are E.164.
  const data: typeof parsed.data = { ...parsed.data };
  if (data.phone !== undefined) {
    if (data.phone === "" || data.phone === null) {
      data.phone = null;
    } else {
      const norm = normalizePhone(data.phone);
      if (!norm) {
        return NextResponse.json(
          { error: "Phone must be in E.164 format (e.g. +14145551234)" },
          { status: 400 },
        );
      }
      data.phone = norm;
    }
  }

  // If they're turning SMS on but have no phone, reject.
  if (data.receiveAlertsBySms === true) {
    const phone = data.phone ?? (await prisma.user.findUnique({
      where: { id: session.user.id }, select: { phone: true },
    }))?.phone;
    if (!phone) {
      return NextResponse.json(
        { error: "Add a phone number before enabling SMS alerts." },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: selectFields,
  });
  return NextResponse.json(updated);
}
