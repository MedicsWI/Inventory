// /api/locations — list (with optional ?tree=1) + create
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { prismaErrorResponse } from "@/lib/api-errors";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["STATION", "VEHICLE", "BOX", "KIT", "SHELF"]),
  parentId: z.string().cuid().nullable().optional(),
  barcode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const wantTree = searchParams.get("tree") === "1";

  const all = await prisma.location.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { _count: { select: { items: true } } },
  });

  if (!wantTree) {
    return NextResponse.json(all);
  }

  // Build a tree client-side from the flat list
  type Node = (typeof all)[number] & { children: Node[]; itemCount: number };
  const byId = new Map<string, Node>();
  all.forEach((l) =>
    byId.set(l.id, { ...l, children: [], itemCount: l._count.items } as Node),
  );
  const roots: Node[] = [];
  byId.forEach((n) => {
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  });

  return NextResponse.json(roots);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertCan(session.user.role, "location:create");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let created;
  try {
    created = await prisma.location.create({ data: parsed.data });
  } catch (e) {
    const r = prismaErrorResponse(e); // duplicate barcode → 409
    if (r) return r;
    throw e;
  }
  await logActivity({
    userId: session.user.id,
    action: "CREATE",
    entityType: "LOCATION",
    entityId: created.id,
    after: JSON.parse(JSON.stringify(created)),
  });
  return NextResponse.json(created, { status: 201 });
}
