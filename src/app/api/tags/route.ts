// /api/tags — list + create
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json(tags.map((t) => ({ id: t.id, name: t.name, color: t.color, itemCount: t._count.items })));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Tags are shared taxonomy — same gate as categories.
  try { assertCan(session.user.role, "category:manage"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const created = await prisma.tag.upsert({
    where: { name: parsed.data.name },
    // Re-posting an existing tag with a new color updates it (was silently dropped)
    update: parsed.data.color !== undefined ? { color: parsed.data.color } : {},
    create: parsed.data,
  });
  return NextResponse.json(created, { status: 201 });
}
