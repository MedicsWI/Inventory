"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Html5Qrcode } from "html5-qrcode";
import { ScanLine, Plus, RefreshCcw, Loader2, Keyboard, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { api } from "@/lib/api-client";

type ProductHit = {
  source: "upc" | "ndc";
  found: true;
  code: string;
  name: string | null;
  description: string | null;
  brand: string | null;
  manufacturer?: string | null;
  imageUrl?: string | null;
};

// Classify a scanned/typed code:
//   - dashed segments (2 or 3) → NDC
//   - 10–11 digit raw numeric → NDC (HIPAA 11 or 10-digit FDA)
//   - 12-digit UPC-A starting with "3" → NDC (GS1 NHRIC — US drug)
//   - 13/14-digit GS1 wrapping a "3..." UPC → NDC
//   - 8/12/13/14 digit raw numeric → UPC/EAN
//   - 9 digit raw numeric → ambiguous; try NDC first
function classify(code: string): "ndc" | "upc" | null {
  const t = code.trim();
  if (/^\d{4,5}-\d{3,4}(-\d{1,2})?$/.test(t)) return "ndc";

  if (/^\d+$/.test(t)) {
    const n = t.length;
    if (n === 10 || n === 11 || n === 9) return "ndc";
    // GS1 wrappers around an NDC on a drug package
    if (n === 12 && t.startsWith("3")) return "ndc";
    if (n === 13 && t.startsWith("03")) return "ndc";
    if (n === 14 && (t.startsWith("003") || t.startsWith("030"))) return "ndc";
    if (n === 8 || n === 12 || n === 13 || n === 14) return "upc";
  }
  return null;
}

export default function ScanPage() {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [hit, setHit] = useState<ProductHit | null>(null);
  const [checking, setChecking] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [decodingPhoto, setDecodingPhoto] = useState(false);
  const router = useRouter();

  async function resolve(rawValue: string) {
    setOpen(false);
    setHit(null);
    setUnknownCode(null);
    setManual("");

    try {
      const res = await api.post<{ type: "item" | "location" | "unknown"; entity?: { id: string }; code?: string }>(
        "/api/scan",
        { code: rawValue },
      );
      if (res.type === "item" && res.entity) {
        router.push(`/items/${res.entity.id}`);
        return;
      }
      if (res.type === "location" && res.entity) {
        router.push(`/locations/${res.entity.id}`);
        return;
      }
    } catch {
      /* fall through */
    }

    setUnknownCode(rawValue);

    const kind = classify(rawValue);
    if (kind === "ndc") {
      setChecking(true);
      try {
        const r = await fetch(`/api/ndc/${encodeURIComponent(rawValue)}`, { credentials: "include" });
        if (r.ok) {
          const j = await r.json();
          setHit({
            source: "ndc",
            found: true,
            code: j.code,
            name: j.name,
            description: [j.activeIngredients, j.dosageForm].filter(Boolean).join(" · "),
            brand: j.brandName,
            manufacturer: j.manufacturer,
            imageUrl: null,
          });
        } else {
          // If NDC missed but it's a number that could also be a UPC (12/13 digit), try UPC fallback.
          const digits = rawValue.replace(/\D/g, "");
          if (digits.length === 12 || digits.length === 13) {
            const r2 = await fetch(`/api/upc/${encodeURIComponent(digits)}`, { credentials: "include" });
            if (r2.ok) {
              const j2 = await r2.json();
              setHit({
                source: "upc",
                found: true,
                code: j2.code,
                name: j2.name,
                description: j2.description,
                brand: j2.brand,
                manufacturer: null,
                imageUrl: j2.imageUrl,
              });
            }
          }
        }
      } catch { /* ignore */ }
      finally { setChecking(false); }
    } else if (kind === "upc") {
      setChecking(true);
      try {
        const r = await fetch(`/api/upc/${encodeURIComponent(rawValue)}`, { credentials: "include" });
        if (r.ok) {
          const j = await r.json();
          setHit({
            source: "upc",
            found: true,
            code: j.code,
            name: j.name,
            description: j.description,
            brand: j.brand,
            manufacturer: null,
            imageUrl: j.imageUrl,
          });
        }
      } catch { /* ignore */ }
      finally { setChecking(false); }
    }
  }

  function createUrl(): string {
    if (!unknownCode) return "/items/new";
    const params = new URLSearchParams({ barcode: unknownCode });
    if (hit?.name) params.set("name", hit.name);
    if (hit?.description) params.set("description", hit.description);
    if (hit?.brand) params.set("brand", hit.brand);
    if (hit?.manufacturer) params.set("manufacturer", hit.manufacturer);
    return `/items/new?${params.toString()}`;
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (manual.trim()) resolve(manual.trim());
  }

  async function decodePhoto(file: File) {
    setDecodingPhoto(true);
    // html5-qrcode needs a DOM container — create a hidden one, decode, then clean up
    const hostId = `photo-decoder-${Date.now()}`;
    const host = document.createElement("div");
    host.id = hostId;
    host.style.display = "none";
    document.body.appendChild(host);
    try {
      const decoder = new Html5Qrcode(hostId, { verbose: false });
      const decoded = await decoder.scanFile(file, false);
      try { await decoder.clear(); } catch { /* ignore */ }
      await resolve(decoded);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUnknownCode(null);
      setHit(null);
      // Couldn't decode — guide the user to the next best thing
      alert(`Couldn't read the barcode in that photo: ${msg}\n\nTry getting closer, brighter light, or use the manual entry below.`);
    } finally {
      setDecodingPhoto(false);
      try { document.body.removeChild(host); } catch { /* ignore */ }
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4 mt-6">
      <h1 className="text-2xl font-bold">Scan</h1>
      <p className="text-muted-foreground">
        Point your camera at a barcode or QR. We'll jump to the item or location if we know it.
      </p>

      <Button size="lg" className="w-full" onClick={() => { setUnknownCode(null); setHit(null); setOpen(true); }}>
        <ScanLine className="h-5 w-5" /> Start camera
      </Button>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void decodePhoto(f);
          e.target.value = ""; // reset so picking the same file twice still fires
        }}
      />
      <Button
        size="lg"
        variant="outline"
        className="w-full"
        onClick={() => photoInputRef.current?.click()}
        disabled={decodingPhoto}
      >
        {decodingPhoto ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
        {decodingPhoto ? "Reading photo…" : "Scan from photo"}
      </Button>
      <p className="text-xs text-muted-foreground -mt-2">
        Best fallback for tricky barcodes — opens your camera, you snap a clear photo, we decode the still image (much more reliable than live video).
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4" /> Or enter code manually
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitManual} className="flex gap-2">
            <Input
              ref={manualInputRef}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="UPC, NDC, or your own item code"
            />
            <Button type="submit" disabled={!manual.trim()}>Look up</Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Works with USB barcode scanners — they type like a keyboard, so just focus this box and scan.
          </p>
        </CardContent>
      </Card>

      {unknownCode && (
        <Card>
          <CardHeader>
            <CardTitle>Code not in your inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md bg-muted p-3 font-mono text-sm break-all">{unknownCode}</div>

            {checking && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Looking up external product database…
              </div>
            )}

            {hit?.found && (
              <div className="rounded-md border bg-card p-3 flex gap-3">
                {hit.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hit.imageUrl} alt="" className="h-16 w-16 object-cover rounded" />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{hit.name ?? "Unnamed product"}</div>
                  {hit.brand && <div className="text-xs text-muted-foreground">Brand: {hit.brand}</div>}
                  {hit.manufacturer && <div className="text-xs text-muted-foreground">Mfr: {hit.manufacturer}</div>}
                  {hit.description && <div className="text-xs mt-1">{hit.description}</div>}
                  <div className="text-xs text-muted-foreground mt-1">
                    Found via {hit.source === "ndc" ? "openFDA (drug database)" : "UPCitemdb"}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link href={createUrl()}>
                  <Plus className="h-4 w-4" />
                  {hit?.found ? "Create item from this product" : "Create new item with this code"}
                </Link>
              </Button>
              <Button variant="outline" onClick={() => { setUnknownCode(null); setHit(null); setOpen(true); }}>
                <RefreshCcw className="h-4 w-4" /> Scan again
              </Button>
              <Button variant="ghost" onClick={() => { setUnknownCode(null); setHit(null); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {open && (
        <BarcodeScanner
          onScan={({ rawValue }) => resolve(rawValue)}
          onClose={() => setOpen(false)}
          onManualEntry={() => {
            setOpen(false);
            // wait a tick for the scanner overlay to unmount, then focus the input
            setTimeout(() => {
              manualInputRef.current?.focus();
              manualInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          }}
        />
      )}
    </div>
  );
}
