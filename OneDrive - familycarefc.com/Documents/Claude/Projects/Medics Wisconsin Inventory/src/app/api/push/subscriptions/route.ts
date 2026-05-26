// /api/push/subscriptions — list this user's subscriptions (for the settings UI)
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.pushSubscription.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, endpoint: true, userAgent: true, createdAt: true },
  });
  // Don't return the keys — they're not needed by the UI and shouldn't leave the server.
  return NextResponse.json(rows);
}
