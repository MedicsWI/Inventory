// /api/users — list + create (admin/manager only; user:manage permission required)
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(["ADMIN", "MANAGER", "MEDIC"]).default("MEDIC"),
  password: z.string().min(8).max(200),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true, image: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "user:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const created = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  await logActivity({
    userId: session.user.id,
    action: "CREATE",
    entityType: "USER",
    entityId: created.id,
    after: { id: created.id, email: created.email, name: created.name, role: created.role },
  });

  return NextResponse.json(created, { status: 201 });
}
