// /api/search?q=… — search items, locations, categories. Returns up to ~12 hits per type.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ items: [], locations: [], categories: [] });

  const [items, locations, categories] = await Promise.all([
    prisma.item.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 12,
      orderBy: { name: "asc" },
      select: { id: true, name: true, quantity: true, unit: true },
    }),
    prisma.location.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 12,
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
    prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 12,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return NextResponse.json({ items, locations, categories });
}
