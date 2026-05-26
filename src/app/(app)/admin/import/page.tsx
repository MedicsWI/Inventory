"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Upload, Download, ChevronLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ParsedRow = Record<string, string>;
type ImportResult = {
  summary: { total: number; created: number; updated: number; errors: number };
  results: { index: number; status: "created" | "updated" | "error"; name?: string; error?: string; id?: string }[];
};

const TEMPLATE_HEADERS = [
  "name",
  "barcode",
  "sku",
  "quantity",
  "unit",
  "lotNumber",
  "expirationDate",
  "lowStockThreshold",
  "locationName",
  "categoryName",
  "notes",
];

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const data = (parsed.data ?? []).filter((r) => r && typeof r === "object" && Object.values(r).some((v) => v));
        setRows(data);
        setResult(null);
        if (parsed.errors?.length) {
          toast.warning(`Parsed with ${parsed.errors.length} warnings — first: ${parsed.errors[0].message}`);
        } else {
          toast.success(`Parsed ${data.length} rows. Review then import.`);
        }
      },
      error: (err) => toast.error(`Parse error: ${err.message}`),
    });
  }

  function downloadTemplate() {
    const sample = [
      [
        "Tourniquet (CAT 7)", "ITEM-TQ-CAT7", "TQ-7", "10", "each", "LOT-2024-01", "",
        "5", "Trauma Kit A", "Bandaging", "Combat application",
      ],
    ];
    const csv = Papa.unparse({ fields: TEMPLATE_HEADERS, data: sample });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "medics-wi-items-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const importMut = useMutation({
    mutationFn: () => api.post<ImportResult>("/api/items/import", { rows, createMissingCategories: true }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Done. ${res.summary.created} created, ${res.summary.updated} updated, ${res.summary.errors} errors.`);
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin"><ChevronLeft className="h-4 w-4" /> Admin</Link>
      </Button>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bulk import items</h1>
          <p className="text-sm text-muted-foreground">CSV upload. Existing items match by barcode and are updated.</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="h-4 w-4" /> Template CSV
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Upload CSV</CardTitle>
          <CardDescription>
            Columns: {TEMPLATE_HEADERS.join(", ")}. <br />
            <span className="text-xs">
              <strong>locationName</strong> must match an existing location (case-insensitive).
              <strong> categoryName</strong> is auto-created if it doesn't exist.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Choose CSV file
          </Button>
          {fileName && <span className="ml-3 text-sm text-muted-foreground">{fileName}</span>}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>2. Preview ({rows.length} rows)</CardTitle>
              <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>
                {importMut.isPending ? "Importing…" : "Import all"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  {TEMPLATE_HEADERS.map((h) => <th key={h} className="py-1 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b last:border-none">
                    {TEMPLATE_HEADERS.map((h) => (
                      <td key={h} className="py-1 pr-3">{(r as Record<string, string>)[h] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && <div className="mt-2 text-xs text-muted-foreground">Showing first 20 of {rows.length}.</div>}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>3. Result</CardTitle>
            <CardDescription>
              <Badge variant="ok">{result.summary.created} created</Badge>{" "}
              <Badge variant="secondary">{result.summary.updated} updated</Badge>{" "}
              <Badge variant={result.summary.errors > 0 ? "danger" : "outline"}>{result.summary.errors} errors</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {result.results.filter((r) => r.status === "error").map((r) => (
              <div key={r.index} className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-danger" />
                <span>
                  Row {r.index + 1}{r.name ? ` (${r.name})` : ""}: <span className="text-danger">{r.error}</span>
                </span>
              </div>
            ))}
            {result.summary.errors === 0 && (
              <div className="flex items-center gap-2 text-ok">
                <CheckCircle2 className="h-4 w-4" /> All rows processed successfully.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
