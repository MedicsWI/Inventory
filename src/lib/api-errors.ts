// Shared Prisma/JSON error → HTTP response mapping for API routes.
// Usage:  catch (e) { const r = prismaErrorResponse(e); if (r) return r; throw e; }
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export function prismaErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const target = Array.isArray(e.meta?.target) ? (e.meta.target as string[]).join(", ") : "value";
      return NextResponse.json(
        { error: `Already exists — duplicate ${target}.` },
        { status: 409 },
      );
    }
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e.code === "P2003") {
      return NextResponse.json(
        { error: "This record is referenced by other data and can't be changed this way." },
        { status: 409 },
      );
    }
  }
  return null;
}
