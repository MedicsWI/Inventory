"use client";

// QR-label printer. Paste a list of equipment IDs (one per line), generate
// scannable QR codes, then print as a sheet to slap on radios, carts, bags, etc.
// At event check-out, the kiosk's "Scan" button reads these QRs to auto-fill
// the identifier field.

import { useEffect, useRef, useState } from "react";
import bwipjs from "bwip-js";
import { Printer, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

      {generated.length > 0 && (
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
