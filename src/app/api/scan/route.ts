// /api/scan — look up an item or location by barcode
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

const schema = z.object({ code: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const code = parsed.data.code.trim();

  // Try item first, then location
  const item = await prisma.item.findFirst({
    where: { OR: [{ barcode: code }, { sku: code }] },
    include: { location: true, category: true },
  });

  if (item) {
    await logActivity({
      userId: session.user.id,
      action: "SCAN",
      entityType: "ITEM",
      entityId: item.id,
      metadata: { code },
    });
    return NextResponse.json({ type: "item", entity: item });
  }

  const loc = await prisma.location.findFirst({ where: { barcode: code } });
  if (loc) {
    await logActivity({
      userId: session.user.id,
      action: "SCAN",
      entityType: "LOCATION",
      entityId: loc.id,
      metadata: { code },
    });
    return NextResponse.json({ type: "location", entity: loc });
  }

  return NextResponse.json({ type: "unknown", code }, { status: 404 });
}
