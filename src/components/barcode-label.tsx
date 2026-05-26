"use client";

// Renders a printable barcode / QR using bwip-js into a canvas.
// Used for label printing.
import * as React from "react";
import bwipjs from "bwip-js";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function BarcodeLabel({
  value,
  title,
  subtitle,
  symbology = "qrcode",
  scale = 4,
}: {
  value: string;
  title?: string;
  subtitle?: string;
  symbology?: "qrcode" | "code128";
  scale?: number;
}) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    if (!ref.current || !value) return;
    try {
      bwipjs.toCanvas(ref.current, {
        bcid: symbology,
        text: value,
        scale,
        height: symbology === "qrcode" ? 0 : 10,
        includetext: symbology === "code128",
        textxalign: "center",
      });
    } catch (e) {
      console.error("Barcode render failed", e);
    }
  }, [value, symbology, scale]);

  function printLabel() {
    const canvas = ref.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank", "width=400,height=300");
    if (!w) return;
    w.document.write(`
      <html>
        <head><title>Label</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 16px; }
            img { display: block; margin: 0 auto; }
            h3 { margin: 8px 0 0; }
            p { margin: 0; color: #555; font-size: 12px; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" alt="${value}" />
          ${title ? `<h3>${title}</h3>` : ""}
          ${subtitle ? `<p>${subtitle}</p>` : ""}
          <p>${value}</p>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    w.document.close();
  }

  return (
    <div className="flex flex-col items-center gap-3 p-4 border rounded-xl bg-card">
      <canvas ref={ref} className="bg-white p-2 rounded" />
      {title && <div className="text-center font-semibold">{title}</div>}
      {subtitle && <div className="text-center text-sm text-muted-foreground">{subtitle}</div>}
      <div className="text-xs text-muted-foreground">{value}</div>
      <Button variant="outline" onClick={printLabel}>
        <Printer className="h-4 w-4" /> Print label
      </Button>
    </div>
  );
}
