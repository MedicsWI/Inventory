"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Upload, Download, ChevronLeft, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
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
  const csvRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleCsv(file: File) {
    setFileName(file.name);
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const data = (parsed.data ?? []).filter(
          (r) => r && typeof r === "object" && Object.values(r).some((v) => v),
        );
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

  function handleXlsx(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        // Read as array-of-arrays so we can find the header row ourselves
        const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false });

        if (raw.length < 2) { toast.error("Sheet appears empty."); return; }

        // Find the row that contains "name" — supports our 2-row-header template
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(raw.length, 5); i++) {
          if ((raw[i] as string[]).some((cell) => String(cell).toLowerCase() === "name")) {
            headerRowIdx = i;
            break;
          }
        }

        const headers = (raw[headerRowIdx] as string[]).map((h) => String(h).trim());
        const dataRows: ParsedRow[] = [];
        for (let i = headerRowIdx + 1; i < raw.length; i++) {
          const rowArr = raw[i] as string[];
          const obj: ParsedRow = {};
          headers.forEach((h, j) => { obj[h] = String(rowArr[j] ?? "").trim(); });
          // Skip blank rows and the template description row
          if (Object.values(obj).every((v) => v === "")) continue;
          if (obj["name"]?.toLowerCase().includes("required") || obj["name"]?.toLowerCase().includes("item name")) continue;
          dataRows.push(obj);
        }

        setRows(dataRows);
        setResult(null);
        toast.success(`Parsed ${dataRows.length} rows from "${sheetName}". Review then import.`);
      } catch (err) {
        toast.error(`Could not parse Excel file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadXlsxTemplate() {
    const a = document.createElement("a");
    a.href = "/templates/medics-wi-items-import-template.xlsx";
    a.download = "medics-wi-items-import-template.xlsx";
    a.click();
  }

  function downloadCsvTemplate() {
    const sample = [["Tourniquet (CAT 7)", "ITEM-TQ-CAT7", "TQ-7", "10", "each", "LOT-2024-01", "", "5", "Trauma Kit A", "Bandaging", "Combat application"]];
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
          <p className="text-sm text-muted-foreground">Excel or CSV upload. Existing items match by barcode and are updated.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={downloadXlsxTemplate}>
            <FileSpreadsheet className="h-4 w-4" /> Excel template
          </Button>
          <Button variant="ghost" onClick={downloadCsvTemplate}>
            <Download className="h-4 w-4" /> CSV template
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Upload file</CardTitle>
          <CardDescription>
            Columns: {TEMPLATE_HEADERS.join(", ")}.<br />
            <span className="text-xs">
              <strong>locationName</strong> must match an existing location (case-insensitive).{" "}
              <strong>categoryName</strong> is auto-created if it doesn&apos;t exist.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <input ref={xlsxRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXlsx(f); e.target.value = ""; }} />
          <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsv(f); e.target.value = ""; }} />

          <Button onClick={() => xlsxRef.current?.click()}>
            <FileSpreadsheet className="h-4 w-4" /> Choose Excel file (.xlsx)
          </Button>
          <Button variant="outline" onClick={() => csvRef.current?.click()}>
            <Upload className="h-4 w-4" /> Choose CSV file
          </Button>
          {fileName && <span className="self-center text-sm text-muted-foreground">{fileName}</span>}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
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
                      <td key={h} className="py-1 pr-3">{r[h] ?? ""}</td>
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
