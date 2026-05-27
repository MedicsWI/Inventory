// /api/alerts — list past alerts (audit log).
// Admin / Ops Hub. Filter by eventId, topic, since.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { identifyCaller } from "@/lib/ops-hub-auth";
import type { AlertTopic } from "@prisma/client";

export async function GET(req: Request) {
  const session = await auth();
  const caller = identifyCaller(req, session);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const topic = searchParams.get("topic") as AlertTopic | null;
  const sinceParam = searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;

  const alerts = await prisma.alert.findMany({
    where: {
      ...(eventId ? { eventId } : {}),
      ...(topic ? { topic } : {}),
      ...(since && !isNaN(since.getTime()) ? { createdAt: { gte: since } } : {}),
    },
    include: {
      event: { select: { id: true, name: true } },
      sentBy: { select: { id: true, name: true, email: true } },
      _count: { select: { sends: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(alerts);
}
