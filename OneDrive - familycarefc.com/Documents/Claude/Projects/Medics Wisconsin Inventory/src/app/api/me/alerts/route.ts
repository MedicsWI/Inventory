// /api/me/alerts — read + update my own notification preferences
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  receiveExpirationAlerts: z.boolean().optional(),
  receiveLowStockAlerts: z.boolean().optional(),
  receiveAlertsByEmail: z.boolean().optional(),
  receiveAlertsByTeams: z.boolean().optional(),
  receiveAlertsByPush: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      receiveExpirationAlerts: true,
      receiveLowStockAlerts: true,
      receiveAlertsByEmail: true,
      receiveAlertsByTeams: true,
      receiveAlertsByPush: true,
    },
  });
  return NextResponse.json(user ?? {});
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: {
      receiveExpirationAlerts: true,
      receiveLowStockAlerts: true,
      receiveAlertsByEmail: true,
      receiveAlertsByTeams: true,
      receiveAlertsByPush: true,
    },
  });
  return NextResponse.json(updated);
}
