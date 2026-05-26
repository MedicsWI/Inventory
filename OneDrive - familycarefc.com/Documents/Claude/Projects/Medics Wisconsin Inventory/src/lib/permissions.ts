// Role-based permission helpers. Keep the matrix dead-simple and centralized.
import type { Role } from "@prisma/client";

export type Permission =
  | "item:create"
  | "item:update"
  | "item:delete"
  | "item:adjust-qty"
  | "location:create"
  | "location:update"
  | "location:delete"
  | "user:manage"
  | "category:manage"
  | "import:bulk"
  | "scan";

const matrix: Record<Role, Permission[]> = {
  ADMIN: [
    "item:create", "item:update", "item:delete", "item:adjust-qty",
    "location:create", "location:update", "location:delete",
    "user:manage", "category:manage", "import:bulk", "scan",
  ],
  MANAGER: [
    "item:create", "item:update", "item:delete", "item:adjust-qty",
    "location:create", "location:update", "location:delete",
    "category:manage", "import:bulk", "scan",
  ],
  MEDIC: [
    "item:adjust-qty", "scan",
  ],
};

export function can(role: Role | undefined | null, p: Permission): boolean {
  if (!role) return false;
  return matrix[role]?.includes(p) ?? false;
}

export function assertCan(role: Role | undefined | null, p: Permission) {
  if (!can(role, p)) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}
