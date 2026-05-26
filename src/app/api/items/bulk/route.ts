// /api/items/bulk — apply the same patch to many items
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const schema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(500),
  patch: z.object({
    locationId: z.string().cuid().nullable().optional(),
    categoryId: z.string().cuid().nullable().optional(),
    addTagIds: z.array(z.string().cuid()).optional(),
    removeTagIds: z.array(z.string().cuid()).optional(),
  }),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "item:update"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { ids, patch } = parsed.data;
  const baseData: Record<string, unknown> = {};
  if (patch.locationId !== undefined) baseData.locationId = patch.locationId;
  if (patch.categoryId !== undefined) baseData.categoryId = patch.categoryId;

  // For tag add/remove we have to operate per-item because Prisma's updateMany
  // doesn't support relational ops.
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await tx.item.update({
        where: { id },
        data: {
          ...baseData,
          ...(patch.addTagIds?.length ? { tags: { connect: patch.addTagIds.map((tid) => ({ id: tid })) } } : {}),
          ...(patch.removeTagIds?.length ? { tags: { disconnect: patch.removeTagIds.map((tid) => ({ id: tid })) } } : {}),
        },
      });
      updated++;
    }
  });

  await logActivity({
    userId: session.user.id,
    action: "UPDATE",
    entityType: "ITEM",
    entityId: "bulk",
    metadata: { idCount: ids.length, patch },
  });

  return NextResponse.json({ updated });
}
