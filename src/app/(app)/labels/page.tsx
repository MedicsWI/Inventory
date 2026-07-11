"use client";

// QR-label printer. Paste a list of equipment IDs (one per line), generate
// scannable QR codes, then print as a sheet to slap on radios, carts, bags, etc.
// At event check-out, the kiosk's "Scan" button reads these QRs to auto-fill
// the identifier field.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import bwipjs from "bwip-js";
import { Printer, QrCode, FolderTree, Keyboard } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// User-supplied strings go into document.write() HTML below — escape them so a
// label ID like `<img onerror=...>` can't inject markup into the print window.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function LabelsPage() {
  const [mode, setMode] = useState<"ids" | "locations">("ids");
  const [raw, setRaw] = useState("");
  const [labelTitle, setLabelTitle] = useState("");
  const [generated, setGenerated] = useState<string[]>([]);

  function parseInput(): string[] {
    return raw
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function handleGenerate() {
    // Dedupe — repeated IDs would render duplicate React keys and duplicate labels.
    const ids = Array.from(new Set(parseInput()));
    if (ids.length === 0) return;
    setGenerated(ids);
  }

  function printSheet() {
    if (generated.length === 0) return;
    // Render each ID to a data URL using bwip-js, then open a print window.
    const cards = generated.map((id) => {
      const canvas = document.createElement("canvas");
      try {
        bwipjs.toCanvas(canvas, {
          bcid: "qrcode",
          text: id,
          scale: 4,
        });
      } catch {
        return null;
      }
      return { id, dataUrl: canvas.toDataURL("image/png") };
    }).filter((x): x is { id: string; dataUrl: string } => x !== null);

    const html = `
      <html>
        <head><title>QR Labels</title>
          <style>
            @page { margin: 0.5in; }
            body { font-family: system-ui, Segoe UI, sans-serif; margin: 0; padding: 0; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 16px; }
            .label { border: 1px dashed #ccc; padding: 12px; text-align: center; page-break-inside: avoid; }
            .label img { display: block; margin: 0 auto 8px; max-width: 160px; }
            .label .id { font-size: 14px; font-weight: 600; word-break: break-all; }
            .label .title { font-size: 11px; color: #555; margin-top: 4px; }
            @media print {
              .label { border-color: #ddd; }
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${cards.map((c) => `
              <div class="label">
                <img src="${c.dataUrl}" alt="${escapeHtml(c.id)}" />
                <div class="id">${escapeHtml(c.id)}</div>
                ${labelTitle ? `<div class="title">${escapeHtml(labelTitle)}</div>` : ""}
              </div>
            `).join("")}
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <QrCode className="h-6 w-6" /> Print QR labels
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Print scannable QR codes for radios, carts, bags, AEDs — anything you sign in/out at events.
          The kiosk OUT dialog can scan these to auto-fill the identifier.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant={mode === "ids" ? "default" : "outline"} onClick={() => setMode("ids")}>
          <Keyboard className="h-4 w-4" /> Paste IDs
        </Button>
        <Button variant={mode === "locations" ? "default" : "outline"} onClick={() => setMode("locations")}>
          <FolderTree className="h-4 w-4" /> Locations
        </Button>
      </div>

      {mode === "locations" && <LocationLabels />}

      {mode === "ids" && (
      <Card>
        <CardHeader>
          <CardTitle>Labels</CardTitle>
          <CardDescription>One ID per line. Each line becomes one QR label.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Equipment IDs</Label>
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"Radio-01\nRadio-02\nCart-A\nCart-B\nBag-Trauma-1"}
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {parseInput().length} label{parseInput().length === 1 ? "" : "s"} ready.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Footer text (optional, printed under each QR)</Label>
            <Input
              value={labelTitle}
              onChange={(e) => setLabelTitle(e.target.value)}
              placeholder="Medics Wisconsin"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={parseInput().length === 0}>
              <QrCode className="h-4 w-4" /> Preview
            </Button>
            <Button variant="outline" onClick={printSheet} disabled={generated.length === 0}>
              <Printer className="h-4 w-4" /> Print sheet
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {mode === "ids" && generated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview ({generated.length})</CardTitle>
            <CardDescription>Visual check before printing. Use Print sheet to send to your printer.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {generated.map((id) => (
                <LabelPreview key={id} id={id} footer={labelTitle} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LabelPreview({ id, footer }: { id: string; footer: string }) {
  const ref = useCanvasQr(id);
  return (
    <div className="rounded-md border p-3 text-center bg-card">
      <canvas ref={ref} className="bg-white p-2 rounded mx-auto" />
      <div className="text-sm font-semibold mt-2 break-all">{id}</div>
      {footer && <div className="text-xs text-muted-foreground mt-1">{footer}</div>}
    </div>
  );
}

function useCanvasQr(value: string) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      bwipjs.toCanvas(ref.current, { bcid: "qrcode", text: value, scale: 3 });
    } catch {}
  }, [value]);
  return ref;
}

// -------------------- Location labels --------------------
// Pick locations, print QR labels with the location NAME under each code.
// Locations without a barcode get one auto-assigned on print (LOC-<NAME>-<id4>)
// so the label is immediately scannable.

type LocRow = { id: string; name: string; type: string; barcode: string | null };
const LOC_TYPES = ["STATION", "VEHICLE", "BOX", "KIT", "BAG", "SHELF"];

function makeLocationBarcode(l: LocRow): string {
  const slug = l.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  return `LOC-${slug}-${l.id.slice(-4).toUpperCase()}`;
}

function LocationLabels() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState("");
  const [printing, setPrinting] = useState(false);

  const locs = useQuery({
    queryKey: ["locs-flat"],
    queryFn: () => api.get<LocRow[]>("/api/locations"),
  });

  const rows = useMemo(() => {
    const all = locs.data ?? [];
    return typeFilter ? all.filter((l) => l.type === typeFilter) : all;
  }, [locs.data, typeFilter]);

  const assignBarcode = useMutation({
    mutationFn: ({ id, barcode }: { id: string; barcode: string }) =>
      api.patch<LocRow>(`/api/locations/${id}`, { barcode }),
  });

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function printLabels() {
    const chosen = (locs.data ?? []).filter((l) => selected.has(l.id));
    if (chosen.length === 0) return;
    setPrinting(true);
    try {
      // Ensure every chosen location has a scannable barcode.
      const withCodes: { name: string; barcode: string }[] = [];
      for (const l of chosen) {
        let barcode = l.barcode;
        if (!barcode) {
          barcode = makeLocationBarcode(l);
          try {
            await assignBarcode.mutateAsync({ id: l.id, barcode });
          } catch (e) {
            toast.error(`Couldn't assign a barcode to "${l.name}": ${e instanceof Error ? e.message : e}`);
            continue;
          }
        }
        withCodes.push({ name: l.name, barcode });
      }
      if (withCodes.length === 0) return;
      qc.invalidateQueries({ queryKey: ["locs-flat"] });

      const cards = withCodes
        .map(({ name, barcode }) => {
          const canvas = document.createElement("canvas");
          try {
            bwipjs.toCanvas(canvas, { bcid: "qrcode", text: barcode, scale: 4 });
          } catch {
            return null;
          }
          return { name, barcode, dataUrl: canvas.toDataURL("image/png") };
        })
        .filter((x): x is { name: string; barcode: string; dataUrl: string } => x !== null);

      const html = `
        <html>
          <head><title>Location QR Labels</title>
            <style>
              @page { margin: 0.5in; }
              body { font-family: system-ui, Segoe UI, sans-serif; margin: 0; padding: 0; }
              .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 16px; }
              .label { border: 1px dashed #ccc; padding: 12px; text-align: center; page-break-inside: avoid; }
              .label img { display: block; margin: 0 auto 8px; max-width: 160px; }
              .label .name { font-size: 16px; font-weight: 700; }
              .label .code { font-size: 10px; color: #777; margin-top: 4px; word-break: break-all; }
              @media print { .label { border-color: #ddd; } }
            </style>
          </head>
          <body>
            <div class="grid">
              ${cards.map((c) => `
                <div class="label">
                  <img src="${c.dataUrl}" alt="${escapeHtml(c.barcode)}" />
                  <div class="name">${escapeHtml(c.name)}</div>
                  <div class="code">${escapeHtml(c.barcode)}</div>
                </div>
              `).join("")}
            </div>
            <script>window.onload = () => window.print();</script>
          </body>
        </html>
      `;
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(html);
      w.document.close();
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Location labels</CardTitle>
        <CardDescription>
          Pick bags, boxes, and kits — each label prints the QR with the location name under it.
          Locations without a barcode get one assigned automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {LOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set(rows.map((r) => r.id)))} disabled={rows.length === 0}>
            Select all shown ({rows.length})
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
            Clear
          </Button>
          <div className="ml-auto">
            <Button onClick={printLabels} disabled={selected.size === 0 || printing}>
              <Printer className="h-4 w-4" /> {printing ? "Preparing…" : `Print ${selected.size} label(s)`}
            </Button>
          </div>
        </div>

        <div className="rounded-md border overflow-hidden max-h-96 overflow-y-auto">
          {locs.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
          {rows.map((l) => (
            <label key={l.id} className="flex items-center gap-3 border-b p-2.5 last:border-b-0 hover:bg-accent/40 cursor-pointer">
              <input type="checkbox" className="h-4 w-4" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
              <span className="flex-1 min-w-0 truncate font-medium">{l.name}</span>
              {!l.barcode && <Badge variant="outline" className="text-[10px]">no barcode yet</Badge>}
              <Badge variant="outline">{l.type}</Badge>
            </label>
          ))}
          {!locs.isLoading && rows.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No locations match.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
