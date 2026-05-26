"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, History } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, actionLabel } from "@/lib/utils";

type LogRow = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  user?: { name?: string | null; email?: string | null } | null;
};

type Detail = { id: string; name: string };

export default function ItemHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const item = useQuery({
    queryKey: ["item", id],
    queryFn: () => api.get<Detail>(`/api/items/${id}`),
  });
  const logs = useQuery({
    queryKey: ["activity", "item", id],
    queryFn: () => api.get<LogRow[]>(`/api/activity?entityType=ITEM&entityId=${id}&take=500`),
  });

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/items/${id}`}><ChevronLeft className="h-4 w-4" /> Back to item</Link>
      </Button>

      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6" /> History
        </h1>
        <p className="text-sm text-muted-foreground">
          Every change to <span className="font-medium">{item.data?.name ?? "this item"}</span>.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Timeline ({logs.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {logs.data?.length === 0 && !logs.isLoading && (
            <div className="text-sm text-muted-foreground">No history yet.</div>
          )}
          {logs.data?.map((row) => {
            const changes = describeChanges(row);
            return (
              <div key={row.id} className="border-b pb-3 last:border-none">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{row.user?.name || row.user?.email || "System"}</span>
                      <Badge variant="outline">{actionLabel(row.action)}</Badge>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(row.createdAt)}
                  </span>
                </div>
                {changes.length > 0 && (
                  <ul className="mt-2 ml-1 space-y-1 text-sm">
                    {changes.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-muted-foreground w-32 shrink-0 truncate">{c.label}</span>
                        <span className="flex-1 break-words">{c.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

type ChangeRow = { label: string; value: React.ReactNode };

// Human-readable label per field. Anything not here falls back to the raw key.
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  sku: "SKU",
  barcode: "Barcode",
  quantity: "Quantity",
  unit: "Unit",
  lotNumber: "Lot number",
  expirationDate: "Expiration",
  lowStockThreshold: "Low-stock threshold",
  photoUrl: "Photo",
  notes: "Notes",
  locationId: "Location",
  categoryId: "Category",
  returnable: "Returnable",
};

// Fields to skip entirely
const SKIP_FIELDS = new Set(["updatedAt", "createdAt", "id"]);

function describeChanges(row: LogRow): ChangeRow[] {
  if (row.action === "CREATE" && row.after) {
    return [{ label: "Created with", value: summarizeObject(row.after) }];
  }
  if (row.action === "DELETE" && row.before) {
    return [{ label: "Deleted", value: summarizeObject(row.before) }];
  }
  if (row.action === "ADJUST_QTY" && row.before && row.after) {
    const b = (row.before as { quantity?: number }).quantity;
    const a = (row.after as { quantity?: number }).quantity;
    if (b != null && a != null) {
      const diff = a - b;
      return [
        {
          label: "Quantity",
          value: (
            <span>
              <span className="font-mono">{b}</span> → <span className="font-mono">{a}</span>{" "}
              <Badge variant={diff > 0 ? "ok" : "danger"} className="ml-1">
                {diff > 0 ? `+${diff}` : diff}
              </Badge>
            </span>
          ),
        },
      ];
    }
  }
  if (row.action === "UPDATE" && row.before && row.after) {
    const b = row.before as Record<string, unknown>;
    const a = row.after as Record<string, unknown>;
    const rows: ChangeRow[] = [];
    for (const key of Object.keys(a)) {
      if (SKIP_FIELDS.has(key)) continue;
      const beforeVal = b[key];
      const afterVal = a[key];
      if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) continue;
      rows.push({
        label: FIELD_LABELS[key] ?? key,
        value: (
          <span>
            <span className="text-muted-foreground line-through">{formatValue(beforeVal)}</span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span className="font-medium">{formatValue(afterVal)}</span>
          </span>
        ),
      });
    }
    return rows;
  }
  if (row.action === "SCAN") {
    const code = (row.metadata as { code?: string } | null)?.code;
    return code ? [{ label: "Code", value: <span className="font-mono">{code}</span> }] : [];
  }
  if (row.action === "CHECKOUT" && row.metadata) {
    const m = row.metadata as { quantity?: number; borrowerUserId?: string };
    return [
      ...(m.quantity != null ? [{ label: "Quantity", value: String(m.quantity) }] : []),
      ...(m.borrowerUserId ? [{ label: "Borrower (user id)", value: <span className="font-mono text-xs">{m.borrowerUserId}</span> }] : []),
    ];
  }
  if (row.action === "RETURN" && row.metadata) {
    const m = row.metadata as { quantity?: number };
    return m.quantity != null ? [{ label: "Quantity returned", value: String(m.quantity) }] : [];
  }
  return [];
}

function formatValue(v: unknown): React.ReactNode {
  if (v == null || v === "") return <span className="text-muted-foreground italic">empty</span>;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return <span className="font-mono">{v}</span>;
  if (typeof v === "string") {
    // Detect ISO date strings and format friendlier
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDate(v);
    // Truncate very long strings
    if (v.length > 120) return `${v.slice(0, 120)}…`;
    return v;
  }
  if (typeof v === "object") return <span className="font-mono text-xs">{JSON.stringify(v)}</span>;
  return String(v);
}

function summarizeObject(obj: unknown): React.ReactNode {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const interesting = ["name", "quantity", "barcode", "lotNumber", "expirationDate"]
    .filter((k) => o[k] != null && o[k] !== "")
    .map((k) => `${FIELD_LABELS[k] ?? k}: ${typeof o[k] === "string" && /^\d{4}-\d{2}-\d{2}T/.test(o[k] as string) ? formatDate(o[k] as string) : String(o[k])}`)
    .join(" · ");
  return interesting || "—";
}

function formatDateTime(d: string): string {
  const date = new Date(d);
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
