// /api/locations/bulk — change the type on many locations at once
// (e.g. re-classify a pile of KITs as BOXes/BAGs).
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const schema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(500),
  type: z.enum(["STATION", "VEHICLE", "BOX", "KIT", "BAG", "SHELF"]),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "location:update"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { ids, type } = parsed.data;
  const res = await prisma.location.updateMany({
    where: { id: { in: ids } },
    data: { type },
  });

  await logActivity({
    userId: session.user.id,
    action: "UPDATE",
    entityType: "LOCATION",
    entityId: "bulk",
    metadata: { idCount: ids.length, newType: type },
  });

  return NextResponse.json({ updated: res.count });
}
