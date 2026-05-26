"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, FileText, Boxes, Clock, AlertTriangle, Activity, PackageOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { downloadPdfReport } from "@/lib/pdf";

type Report = {
  kind: "items" | "expiring" | "low-stock" | "activity" | "checkouts";
  label: string;
  description: string;
  icon: typeof Boxes;
  subtitle?: string;
  orientation?: "portrait" | "landscape";
};

const reports: Report[] = [
  {
    kind: "items",
    label: "All items",
    description: "Full inventory snapshot. Same column set the import accepts.",
    icon: Boxes,
    subtitle: "Full inventory with locations, categories, expirations, lot numbers",
    orientation: "landscape",
  },
  {
    kind: "expiring",
    label: "Expiring next 30 days",
    description: "Items expiring within 30 days.",
    icon: Clock,
    subtitle: "Items expiring within 30 days",
  },
  {
    kind: "low-stock",
    label: "Low stock",
    description: "All items at or below their low-stock threshold.",
    icon: AlertTriangle,
    subtitle: "Items at or below their low-stock threshold",
  },
  {
    kind: "activity",
    label: "Activity log (last 1000)",
    description: "Audit trail.",
    icon: Activity,
    subtitle: "Audit log — creates, edits, deletes, scans, checkouts",
    orientation: "landscape",
  },
  {
    kind: "checkouts",
    label: "All checkouts",
    description: "Active + returned, with borrower and dates.",
    icon: PackageOpen,
    subtitle: "Checkout history with borrowers and dates",
    orientation: "landscape",
  },
];

export default function ExportPage() {
  const [busy, setBusy] = useState<string | null>(null);

  async function downloadPdf(r: Report) {
    setBusy(r.kind);
    try {
      const res = await fetch(`/api/export/${r.kind}?format=json`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const data = (await res.json()) as {
        filename: string;
        columns: string[];
        rows: (string | number)[][];
      };
      downloadPdfReport({
        title: r.label,
        subtitle: r.subtitle,
        filename: data.filename,
        columns: data.columns,
        rows: data.rows,
        orientation: r.orientation,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin"><ChevronLeft className="h-4 w-4" /> Admin</Link>
      </Button>

      <header>
        <h1 className="text-2xl font-bold">Export</h1>
        <p className="text-sm text-muted-foreground">
          Download any data set as CSV (Excel / Google Sheets) or PDF (printable). Always verify the file before distributing.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-3">
        {reports.map((r) => (
          <Card key={r.kind}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <r.icon className="h-4 w-4 text-primary" /> {r.label}
              </CardTitle>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 flex-wrap">
              <Button asChild variant="outline" className="flex-1">
                <a href={`/api/export/${r.kind}`} download>
                  <Download className="h-4 w-4" /> CSV
                </a>
              </Button>
              <Button
                className="flex-1"
                onClick={() => downloadPdf(r)}
                disabled={busy === r.kind}
              >
                {busy === r.kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                PDF
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
