// /api/ndc/[code] — look up an NDC against openFDA.
//
// openFDA has two relevant fields:
//   - product_ndc   (labeler-product, e.g. "63323-162")
//   - package_ndc   (labeler-product-package, e.g. "63323-162-03")
// We try both fields and multiple format variants because:
//   - HIPAA-style codes are 11 digits, openFDA uses the original 10-digit forms
//   - Input may or may not have dashes
//   - The 10-digit splits are ambiguous (4-4-2, 5-3-2, 5-4-1)
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type FdaProduct = {
  product_ndc?: string;
  generic_name?: string;
  brand_name?: string;
  labeler_name?: string;
  dosage_form?: string;
  route?: string[];
  active_ingredients?: { name: string; strength: string }[];
  packaging?: { description?: string; package_ndc?: string }[];
};

type FdaResponse = {
  meta?: { results?: { total?: number } };
  results?: FdaProduct[];
};

type Ctx = { params: Promise<{ code: string }> };

// Build candidate strings for both product_ndc (2 segments) and package_ndc (3 segments).
function buildCandidates(raw: string): { productNdcCandidates: string[]; packageNdcCandidates: string[] } {
  const productNdcCandidates = new Set<string>();
  const packageNdcCandidates = new Set<string>();

  const cleaned = raw.replace(/[^\d-]/g, "");
  let digits = cleaned.replace(/-/g, "");
  const segments = cleaned.split("-").filter(Boolean);

  // GS1 wrappers on US drug packages:
  //   12-digit UPC-A starting with "3" → "3" + 10-digit NDC + UPC check digit
  //   13-digit EAN-13 starting with "03" or "030" → wraps a UPC-A
  //   14-digit GTIN starting with "00" or "03" → "00" + 12-digit UPC-A
  if (digits.length === 12 && digits.startsWith("3")) {
    digits = digits.slice(1, 11); // drop GS1 prefix + check digit → 10-digit NDC
  } else if (digits.length === 13 && digits.startsWith("03")) {
    // Treat the inner 12-digit UPC-A
    const inner = digits.slice(1);
    if (inner.startsWith("3")) digits = inner.slice(1, 11);
  } else if (digits.length === 14 && (digits.startsWith("00") || digits.startsWith("03"))) {
    const inner = digits.slice(2);
    if (inner.startsWith("3")) digits = inner.slice(1, 11);
    else digits = inner.slice(0, 10);
  }

  // If user typed dashed input, preserve the original
  if (segments.length === 2) productNdcCandidates.add(cleaned);
  if (segments.length === 3) {
    packageNdcCandidates.add(cleaned);
    // Also derive product_ndc by dropping the package segment
    productNdcCandidates.add(`${segments[0]}-${segments[1]}`);
  }

  // 10-digit raw → try all three valid product_ndc splits + corresponding package layouts
  if (digits.length === 10) {
    // 4-4-2 layout: product = 4-4, package = 2
    productNdcCandidates.add(`${digits.slice(0, 4)}-${digits.slice(4, 8)}`);
    packageNdcCandidates.add(`${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 10)}`);
    // 5-3-2 layout: product = 5-3, package = 2
    productNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(5, 8)}`);
    packageNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(5, 8)}-${digits.slice(8, 10)}`);
    // 5-4-1 layout: product = 5-4, package = 1
    productNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(5, 9)}`);
    packageNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(5, 9)}-${digits[9]}`);
  }

  // 11-digit HIPAA (always 5-4-2). Convert to 10-digit by dropping the leading zero
  // from whichever segment had it added.
  if (digits.length === 11) {
    if (digits.startsWith("0")) {
      productNdcCandidates.add(`${digits.slice(1, 5)}-${digits.slice(5, 9)}`);
      packageNdcCandidates.add(`${digits.slice(1, 5)}-${digits.slice(5, 9)}-${digits.slice(9, 11)}`);
    }
    if (digits[5] === "0") {
      productNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(6, 9)}`);
      packageNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(6, 9)}-${digits.slice(9, 11)}`);
    }
    if (digits[9] === "0") {
      productNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(5, 9)}`);
      packageNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(5, 9)}-${digits[10]}`);
    }
    // Last resort: try as straight 5-4-2
    productNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(5, 9)}`);
    packageNdcCandidates.add(`${digits.slice(0, 5)}-${digits.slice(5, 9)}-${digits.slice(9, 11)}`);
  }

  return {
    productNdcCandidates: [...productNdcCandidates],
    packageNdcCandidates: [...packageNdcCandidates],
  };
}

async function searchOpenFda(field: "product_ndc" | "package_ndc", value: string): Promise<FdaProduct | null> {
  const url = `https://api.fda.gov/drug/ndc.json?search=${field}:"${encodeURIComponent(value)}"&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FdaResponse;
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await ctx.params;
  const { productNdcCandidates, packageNdcCandidates } = buildCandidates(code);

  if (productNdcCandidates.length === 0 && packageNdcCandidates.length === 0) {
    return NextResponse.json({ error: "Couldn't derive NDC candidates" }, { status: 400 });
  }

  let hit: FdaProduct | null = null;
  let matchedAs = code;

  // Package-level matches are more specific; try them first.
  for (const candidate of packageNdcCandidates) {
    hit = await searchOpenFda("package_ndc", candidate);
    if (hit) { matchedAs = candidate; break; }
  }
  // Fall back to product_ndc
  if (!hit) {
    for (const candidate of productNdcCandidates) {
      hit = await searchOpenFda("product_ndc", candidate);
      if (hit) { matchedAs = candidate; break; }
    }
  }

  if (!hit) {
    return NextResponse.json(
      { found: false, code, tried: { productNdcCandidates, packageNdcCandidates } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    found: true,
    code: matchedAs,
    productNdc: hit.product_ndc ?? matchedAs,
    name: hit.brand_name || hit.generic_name || null,
    genericName: hit.generic_name ?? null,
    brandName: hit.brand_name ?? null,
    manufacturer: hit.labeler_name ?? null,
    dosageForm: hit.dosage_form ?? null,
    route: hit.route?.join(", ") ?? null,
    activeIngredients:
      hit.active_ingredients?.map((a) => `${a.name} ${a.strength}`).join("; ") ?? null,
  });
}
