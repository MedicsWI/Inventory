// /api/users/[id] — get, update (role, name, password reset), delete
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(200).optional(),
  role: z.enum(["ADMIN", "MANAGER", "MEDIC"]).optional(),
  password: z.string().min(8).max(200).optional(), // admin-set reset
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, createdAt: true, image: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const before = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Don't let an admin demote themselves into a state with no admins (basic safety net).
  if (parsed.data.role && parsed.data.role !== "ADMIN" && id === session.user.id) {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", id: { not: id } },
    });
    if (otherAdmins === 0) {
      return NextResponse.json(
        { error: "You're the only admin — promote another user before demoting yourself." },
        { status: 400 },
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // Email change — case-insensitive uniqueness check with friendly error
  if (parsed.data.email !== undefined) {
    const newEmail = parsed.data.email.toLowerCase();
    if (newEmail !== before.email.toLowerCase()) {
      const taken = await prisma.user.findUnique({ where: { email: newEmail } });
      if (taken && taken.id !== id) {
        return NextResponse.json({ error: "Another user already has that email." }, { status: 409 });
      }
      data.email = newEmail;
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  await logActivity({
    userId: session.user.id,
    action: "UPDATE",
    entityType: "USER",
    entityId: id,
    before: { ...before },
    after: { ...updated, passwordReset: !!parsed.data.password },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "You cannot delete yourself." }, { status: 400 });
  }
  const before = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.user.delete({ where: { id } });
  await logActivity({
    userId: session.user.id,
    action: "DELETE",
    entityType: "USER",
    entityId: id,
    before,
  });
  return NextResponse.json({ ok: true });
}
