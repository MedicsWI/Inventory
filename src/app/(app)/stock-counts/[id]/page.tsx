"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ChevronLeft, Play, Send, Check, Search, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type Line = {
  id: string;
  itemId: string;
  expectedQty: number;
  actualQty: number | null;
  countedAt: string | null;
  notes: string | null;
  item: { id: string; name: string; unit: string | null; barcode: string | null; photoUrl: string | null };
};
type Detail = {
  id: string;
  name: string;
  status: "DRAFT" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CANCELED";
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  location: { id: string; name: string } | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  approvedBy: { id: string; name: string | null; email: string } | null;
  lines: Line[];
};

const statusVariant: Record<Detail["status"], "secondary" | "warn" | "ok" | "outline" | "danger"> = {
  DRAFT: "outline",
  IN_PROGRESS: "warn",
  REVIEW: "secondary",
  COMPLETED: "ok",
  CANCELED: "outline",
};

export default function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN" || session?.user.role === "MANAGER";
  const [q, setQ] = useState("");
  const [discrepanciesOnly, setDiscrepanciesOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["stock-count", id],
    queryFn: () => api.get<Detail>(`/api/stock-counts/${id}`),
    // Only poll while the count is still moving. Once COMPLETED / CANCELED, nothing changes.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "COMPLETED" || status === "CANCELED") return false;
      return 10_000;
    },
  });

  const start = useMutation({
    mutationFn: () => api.post(`/api/stock-counts/${id}/start`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-count", id] }); toast.success("Count started."); },
    onError: (e) => toast.error(String(e)),
  });
  const submit = useMutation({
    mutationFn: () => api.post(`/api/stock-counts/${id}/submit`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-count", id] }); toast.success("Submitted for review."); },
    onError: (e) => toast.error(String(e)),
  });
  const approve = useMutation({
    mutationFn: () => api.post(`/api/stock-counts/${id}/approve`, {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["stock-count", id] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      const applied = (r as { applied?: number })?.applied ?? 0;
      toast.success(`Approved. ${applied} item${applied === 1 ? "" : "s"} adjusted.`);
    },
    onError: (e) => toast.error(String(e)),
  });

  const reject = useMutation({
    mutationFn: (reason?: string) => api.post(`/api/stock-counts/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-count", id] });
      toast.success("Sent back to IN_PROGRESS for recount.");
    },
    onError: (e) => toast.error(String(e)),
  });

  const recordLine = useMutation({
    mutationFn: ({ lineId, actualQty }: { lineId: string; actualQty: number }) =>
      api.patch(`/api/stock-counts/${id}/lines/${lineId}`, { actualQty }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock-count", id] }),
    onError: (e) => toast.error(String(e)),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  const allDiscrepancies = data.lines.filter((l) => l.actualQty != null && l.actualQty !== l.expectedQty);
  const filtered = data.lines.filter((l) => {
    if (discrepanciesOnly && (l.actualQty == null || l.actualQty === l.expectedQty)) return false;
    if (!q) return true;
    return l.item.name.toLowerCase().includes(q.toLowerCase()) || (l.item.barcode ?? "").toLowerCase().includes(q.toLowerCase());
  });

  const countedLines = data.lines.filter((l) => l.actualQty != null).length;
  const discrepancyLines = allDiscrepancies.length;
  const totalUnitsOver = allDiscrepancies
    .filter((l) => (l.actualQty ?? 0) > l.expectedQty)
    .reduce((sum, l) => sum + ((l.actualQty ?? 0) - l.expectedQty), 0);
  const totalUnitsShort = allDiscrepancies
    .filter((l) => (l.actualQty ?? 0) < l.expectedQty)
    .reduce((sum, l) => sum + (l.expectedQty - (l.actualQty ?? 0)), 0);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/stock-counts"><ChevronLeft className="h-4 w-4" /> All counts</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant[data.status]}>{data.status.replace("_", " ")}</Badge>
            {data.location && <Badge variant="outline">📍 {data.location.name}</Badge>}
          </div>
          <h1 className="text-2xl font-bold mt-1">{data.name}</h1>
          <div className="text-sm text-muted-foreground">
            {data.assignedTo && <>Assigned: {data.assignedTo.name ?? data.assignedTo.email}</>}
            {data.startedAt && <> · started {formatDate(data.startedAt)}</>}
            {data.completedAt && <> · completed {formatDate(data.completedAt)} by {data.approvedBy?.name ?? data.approvedBy?.email}</>}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {data.status === "DRAFT" && isAdmin && (
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              <Play className="h-4 w-4" /> Start count
            </Button>
          )}
          {data.status === "IN_PROGRESS" && (
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || countedLines === 0}
              title={countedLines === 0 ? "Record at least one line first" : ""}
            >
              <Send className="h-4 w-4" /> Submit for review
            </Button>
          )}
          {data.status === "REVIEW" && isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const reason = window.prompt("Reason for sending back? (optional)");
                  if (reason !== null) reject.mutate(reason || undefined);
                }}
                disabled={reject.isPending}
              >
                <RotateCcw className="h-4 w-4" /> Reject &amp; recount
              </Button>
              <Button
                onClick={() => {
                  const msg = discrepancyLines > 0
                    ? `Approve will adjust ${discrepancyLines} item${discrepancyLines === 1 ? "" : "s"} to the counted quantities. Continue?`
                    : "No discrepancies to apply. Approve anyway?";
                  if (window.confirm(msg)) approve.mutate();
                }}
                disabled={approve.isPending}
              >
                <Check className="h-4 w-4" /> Approve + adjust stock
              </Button>
            </>
          )}
        </div>
      </header>

      {data.status === "DRAFT" && (
        <Card>
          <CardHeader>
            <CardTitle>Draft</CardTitle>
            <CardDescription>
              When you start the count, the system snapshots the current quantity for every item in scope
              as the "expected" value. The counter then records the actual on-shelf quantity for each.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {(data.status === "IN_PROGRESS" || data.status === "REVIEW" || data.status === "COMPLETED") && (
        <>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Lines" value={data.lines.length} />
            <Stat label="Counted" value={countedLines} />
            <Stat label="Discrepancies" value={discrepancyLines} variant={discrepancyLines > 0 ? "warn" : undefined} />
          </div>

          {discrepancyLines > 0 && (
            <Card className="border-warn/60 bg-warn/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warn" />
                  Discrepancy summary
                </CardTitle>
                <CardDescription>
                  {discrepancyLines} item{discrepancyLines === 1 ? "" : "s"} differ from expected.
                  {data.status === "REVIEW" && " Approve to adjust stock to counted values, or send back for recount."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Mini label="Items off" value={discrepancyLines} />
                  <Mini label="Units over" value={`+${totalUnitsOver}`} accent="warn" />
                  <Mini label="Units short" value={`-${totalUnitsShort}`} accent="danger" />
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by item name or barcode…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={discrepanciesOnly ? "default" : "outline"}
              onClick={() => setDiscrepanciesOnly(!discrepanciesOnly)}
              disabled={discrepancyLines === 0}
            >
              <AlertTriangle className="h-4 w-4" />
              {discrepanciesOnly ? "Show all" : `Discrepancies only (${discrepancyLines})`}
            </Button>
          </div>

          <Card>
            <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {filtered.length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  {discrepanciesOnly
                    ? "No discrepancies match — try clearing the filter."
                    : q ? `No lines match "${q}".` : "No lines on this count yet."}
                </div>
              )}
              {filtered.map((line) => (
                <CountLineRow
                  key={line.id}
                  line={line}
                  readOnly={data.status !== "IN_PROGRESS"}
                  onSet={(qty) => recordLine.mutate({ lineId: line.id, actualQty: qty })}
                />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: number | string; accent?: "warn" | "danger" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent === "warn" ? "text-warn" : accent === "danger" ? "text-destructive" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function CountLineRow({
  line,
  readOnly,
  onSet,
}: {
  line: Line;
  readOnly: boolean;
  onSet: (qty: number) => void;
}) {
  const [local, setLocal] = useState<string>(line.actualQty != null ? String(line.actualQty) : "");
  const diff = line.actualQty != null ? line.actualQty - line.expectedQty : null;
  const isDiscrepancy = diff != null && diff !== 0;

  return (
    <div className={`flex items-center gap-3 rounded-md border p-3 ${isDiscrepancy ? "border-warn/60 bg-warn/5" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{line.item.name}</div>
        <div className="text-xs text-muted-foreground">
          Expected: <span className="font-medium">{line.expectedQty}</span>
          {line.item.unit ? ` ${line.item.unit}` : ""}
          {line.item.barcode && ` · ${line.item.barcode}`}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          type="number"
          min={0}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            if (local === "") return;
            const n = Number(local);
            if (Number.isFinite(n) && n >= 0 && n !== line.actualQty) onSet(n);
          }}
          disabled={readOnly}
          placeholder="actual"
          className="h-10 w-24"
        />
        {diff != null && (
          <Badge variant={diff === 0 ? "ok" : diff > 0 ? "warn" : "danger"}>
            {diff > 0 ? `+${diff}` : diff}
          </Badge>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, variant }: { label: string; value: number; variant?: "warn" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <div className={`text-2xl font-bold tabular-nums ${variant === "warn" ? "text-warn" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
