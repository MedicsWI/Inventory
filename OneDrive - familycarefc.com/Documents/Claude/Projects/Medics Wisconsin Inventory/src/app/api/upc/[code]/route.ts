// /api/upc/[code] — look up a UPC against UPCitemdb (free trial endpoint).
// Used by the scan flow to pre-fill an unknown item's name/brand/image.
//
// Trial endpoint: https://api.upcitemdb.com/prod/trial/lookup?upc=XXXXXXXXXXXX
//   - No key required, but rate-limited (~100/day).
//   - For real use, set UPCITEMDB_API_KEY in .env and we hit the paid endpoint.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type UpcItemDbResponse = {
  code?: string;
  total?: number;
  items?: Array<{
    ean?: string;
    title?: string;
    description?: string;
    brand?: string;
    category?: string;
    images?: string[];
  }>;
  message?: string;
};

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await ctx.params;
  const cleaned = code.replace(/\D/g, "");
  // UPC/EAN are typically 8, 12, 13, or 14 digits.
  if (cleaned.length < 8 || cleaned.length > 14) {
    return NextResponse.json({ error: "Not a UPC/EAN format" }, { status: 400 });
  }

  const apiKey = process.env.UPCITEMDB_API_KEY;
  const url = apiKey
    ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${cleaned}`
    : `https://api.upcitemdb.com/prod/trial/lookup?upc=${cleaned}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(apiKey ? { user_key: apiKey, key_type: "3scale" } : {}),
      },
      // Cache successful lookups for 24h to spare the trial quota.
      next: { revalidate: 86400 },
    });

    if (res.status === 429) {
      return NextResponse.json({ error: "UPC lookup rate-limited. Try again later." }, { status: 429 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
    }

    const data = (await res.json()) as UpcItemDbResponse;
    const first = data.items?.[0];
    if (!first) {
      return NextResponse.json({ found: false, code: cleaned }, { status: 404 });
    }

    return NextResponse.json({
      found: true,
      code: cleaned,
      name: first.title ?? null,
      description: first.description ?? null,
      brand: first.brand ?? null,
      category: first.category ?? null,
      imageUrl: first.images?.[0] ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "UPC lookup failed" },
      { status: 502 },
    );
  }
}
