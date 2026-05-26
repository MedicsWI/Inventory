// Tiny helper to write an ActivityLog row. Used inside API routes.
import { Prisma } from "@prisma/client";
import type { ActivityAction, EntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function logActivity(opts: {
  userId?: string | null;
  action: ActivityAction;
  entityType: EntityType;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: opts.userId ?? null,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        before: opts.before ?? Prisma.JsonNull,
        after: opts.after ?? Prisma.JsonNull,
        metadata: opts.metadata ?? Prisma.JsonNull,
      },
    });
  } catch (e) {
    // Audit must never break the user action; just log.
    console.error("activity log failed", e);
  }
}
