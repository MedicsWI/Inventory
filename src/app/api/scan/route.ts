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

  // Scanners are inconsistent about UPC-A vs EAN-13: the same label can come
  // back as 12 digits or as 13 with a leading 0 (and GS1/ITF-14 wraps add two
  // zeros). Match the stored barcode under any of those spellings so an item
  // that exists never reads as "unknown".
  const variants = new Set([code]);
  if (/^\d+$/.test(code)) {
    const stripped = code.replace(/^0+/, "");
    if (stripped.length >= 8) variants.add(stripped);
    if (code.length === 12) variants.add(`0${code}`);
    if (code.length === 13 && code.startsWith("0")) variants.add(code.slice(1));
    if (code.length === 14 && code.startsWith("00")) variants.add(code.slice(2));
  }
  const codes = [...variants];

  // Try item first, then location
  const item = await prisma.item.findFirst({
    where: { OR: [{ barcode: { in: codes } }, { sku: { in: codes } }] },
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

  const loc = await prisma.location.findFirst({ where: { barcode: { in: codes } } });
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
