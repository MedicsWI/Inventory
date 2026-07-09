"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ChevronLeft, Play, Check, Trash2, ListChecks, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/dialog-provider";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type Line = {
  id: string;
  itemId: string;
  requestedQty: number;
  pickedQty: number;
  notes: string | null;
  pickedAt: string | null;
  item: { id: string; name: string; unit: string | null; barcode: string | null; quantity: number; photoUrl: string | null };
};
type Detail = {
  id: string;
  name: string;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  destination: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  fromLocation: { id: string; name: string } | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  completedBy: { id: string; name: string | null; email: string } | null;
  template: { id: string; name: string } | null;
  lines: Line[];
};

const statusVariant: Record<Detail["status"], "outline" | "warn" | "ok" | "danger"> = {
  DRAFT: "outline",
  IN_PROGRESS: "warn",
  COMPLETED: "ok",
  CANCELED: "danger",
};

export default function PickListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: session } = useSession();
  const [confirmComplete, setConfirmComplete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pick-list", id],
    queryFn: () => api.get<Detail>(`/api/pick-lists/${id}`),
    // Only poll while the list is still moving. Once COMPLETED / CANCELED, nothing changes.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "DRAFT" || status === "IN_PROGRESS") return 10_000;
      return false;
    },
  });

  const start = useMutation({
    mutationFn: () => api.post(`/api/pick-lists/${id}/start`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pick-list", id] });
      qc.invalidateQueries({ queryKey: ["pick-lists"] });
    },
    onError: (e) => toast.error(String(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api.patch(`/api/pick-lists/${id}`, { status: "CANCELED" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pick-list", id] });
      qc.invalidateQueries({ queryKey: ["pick-lists"] });
    },
    onError: (e) => toast.error(String(e)),
  });
  const recordLine = useMutation({
    mutationFn: ({ lineId, pickedQty }: { lineId: string; pickedQty: number }) =>
      api.patch(`/api/pick-lists/${id}/lines/${lineId}`, { pickedQty }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pick-list", id] }),
    onError: (e) => toast.error(String(e)),
  });
  const complete = useMutation({
    mutationFn: () => api.post(`/api/pick-lists/${id}/complete`, {}),
    onSuccess: (r) => {
      const result = r as { lines?: number };
      qc.invalidateQueries({ queryKey: ["pick-list", id] });
      qc.invalidateQueries({ queryKey: ["pick-lists"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Completed. Stock decremented across ${result.lines ?? 0} items.`);
      setConfirmComplete(false);
    },
    onError: (e) => toast.error(String(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/api/pick-lists/${id}`),
    onSuccess: () => { toast.success("Deleted."); window.location.href = "/pick-lists"; },
    onError: (e) => toast.error(String(e)),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  const pickedTotal = data.lines.reduce((s, l) => s + l.pickedQty, 0);
  const requestedTotal = data.lines.reduce((s, l) => s + l.requestedQty, 0);
  const allPicked = data.lines.every((l) => l.pickedQty >= l.requestedQty);
  const insufficientStock = data.lines.some((l) => l.pickedQty > l.item.quantity);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/pick-lists"><ChevronLeft className="h-4 w-4" /> All pick lists</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant[data.status]}>{data.status.replace("_", " ")}</Badge>
            {data.template && <Badge variant="outline">from {data.template.name}</Badge>}
          </div>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
            <ListChecks className="h-6 w-6" /> {data.name}
          </h1>
          <div className="text-xs text-muted-foreground">
            {data.fromLocation && <>From: {data.fromLocation.name} · </>}
            {data.destination && <>To: {data.destination} · </>}
            {data.assignedTo && <>Assigned: {data.assignedTo.name ?? data.assignedTo.email}</>}
            {data.completedAt && data.completedBy && <> · completed {formatDate(data.completedAt)} by {data.completedBy.name ?? data.completedBy.email}</>}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {data.status === "DRAFT" && (
            <Button onClick={() => start.mutate()} disabled={start.isPending || data.lines.length === 0}>
              <Play className="h-4 w-4" /> Start picking
            </Button>
          )}
          {data.status === "IN_PROGRESS" && (
            <Button onClick={() => setConfirmComplete(true)} disabled={complete.isPending || pickedTotal === 0}>
              <Check className="h-4 w-4" /> Complete pick
            </Button>
          )}
          {(data.status === "DRAFT" || data.status === "IN_PROGRESS") && (
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: "Cancel pick list?",
                  description: "This marks the list CANCELED. No stock is changed — anything already picked stays as recorded but won't be decremented.",
                  confirmText: "Cancel list",
                  variant: "destructive",
                });
                if (ok) cancel.mutate();
              }}
            >
              <X className="h-4 w-4" /> Cancel list
            </Button>
          )}
        </div>
      </header>

      {data.notes && (
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{data.notes}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Lines" value={data.lines.length} />
        <Stat label="Requested" value={requestedTotal} />
        <Stat label="Picked" value={pickedTotal} variant={pickedTotal < requestedTotal ? "warn" : "ok"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {data.lines.map((line) => (
            <PickRow
              // pickedQty in the key re-seeds the row's local input when the server value changes
              key={`${line.id}:${line.pickedQty}`}
              line={line}
              readOnly={data.status !== "IN_PROGRESS"}
              onSet={(qty) => recordLine.mutate({ lineId: line.id, pickedQty: qty })}
            />
          ))}
        </CardContent>
      </Card>

      {can(session?.user.role, "location:delete") && (
        <div className="flex justify-end">
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Delete pick list?",
                description: "Removes the pick list and its lines. Item stock isn't affected.",
                confirmText: "Delete",
                variant: "destructive",
              });
              if (ok) del.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      )}

      {confirmComplete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border shadow-xl">
            <div className="p-5 border-b flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warn" />
              <div className="font-semibold">Complete pick?</div>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p>
                This will mark <span className="font-semibold">{data.lines.filter(l => l.pickedQty > 0).length}</span> line(s) as picked
                and <span className="font-semibold">decrement source stock by {pickedTotal} unit{pickedTotal === 1 ? "" : "s"}</span>.
              </p>
              {insufficientStock && (
                <div className="rounded-md bg-warn/15 border border-warn/40 p-3 text-xs">
                  One or more lines have a picked qty greater than current stock.
                  Stock will be decremented only to zero — never negative.
                </div>
              )}
              <p className="text-muted-foreground text-xs">Verify the physical pull before confirming.</p>
            </div>
            <div className="p-5 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmComplete(false)}>Cancel</Button>
              <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
                <Check className="h-4 w-4" /> Confirm complete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PickRow({
  line,
  readOnly,
  onSet,
}: {
  line: Line;
  readOnly: boolean;
  onSet: (qty: number) => void;
}) {
  const [local, setLocal] = useState<string>(String(line.pickedQty));
  const complete = line.pickedQty >= line.requestedQty;
  const insufficient = line.pickedQty > line.item.quantity;

  return (
    <div className={
      "flex items-center gap-3 rounded-md border p-3 " +
      (complete ? "border-ok/40 bg-ok/5" : insufficient ? "border-danger/50 bg-danger/5" : "")
    }>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          <Link className="underline" href={`/items/${line.item.id}`}>{line.item.name}</Link>
        </div>
        <div className="text-xs text-muted-foreground">
          Requested: <span className="font-medium">{line.requestedQty}</span>{line.item.unit ? ` ${line.item.unit}` : ""}
          {" · "}On hand: <span className="font-medium">{line.item.quantity}</span>
          {line.item.barcode && <> · {line.item.barcode}</>}
        </div>
        {line.notes && <div className="text-xs mt-0.5">{line.notes}</div>}
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
            if (Number.isFinite(n) && n >= 0 && n !== line.pickedQty) onSet(n);
          }}
          disabled={readOnly}
          placeholder="picked"
          className="h-10 w-20"
        />
        {complete && <Badge variant="ok">✓</Badge>}
        {insufficient && <Badge variant="danger">over</Badge>}
      </div>
    </div>
  );
}

function Stat({ label, value, variant }: { label: string; value: number; variant?: "warn" | "ok" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <div className={
          "text-2xl font-bold tabular-nums " +
          (variant === "warn" ? "text-warn" : variant === "ok" ? "text-ok" : "")
        }>{value}</div>
      </CardContent>
    </Card>
  );
}
