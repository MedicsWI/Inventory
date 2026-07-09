"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ExternalLink,
  Truck,
  Check,
  Trash2,
  Package,
  CheckCheck,
  AlertTriangle,
  Send,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/dialog-provider";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateOnly } from "@/lib/utils";
import { downloadPdfReport } from "@/lib/pdf";

type Line = {
  id: string;
  itemId: string | null;
  name: string;
  sku: string | null;
  expectedQty: number;
  receivedQty: number;
  unitCost: number | null;
  item: { id: string; name: string } | null;
};
type Detail = {
  id: string;
  vendor: string;
  vendorEmail: string | null;
  vendorContact: string | null;
  vendorPhone: string | null;
  orderNumber: string | null;
  trackingUrl: string | null;
  status: "DRAFT" | "ORDERED" | "SHIPPED" | "PARTIAL" | "RECEIVED" | "CANCELED";
  orderedAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  sentAt: string | null;
  notes: string | null;
  vendorNotes: string | null;
  lines: Line[];
};

const statusVariant: Record<Detail["status"], "outline" | "secondary" | "warn" | "ok" | "danger"> = {
  DRAFT: "outline",
  ORDERED: "secondary",
  SHIPPED: "secondary",
  PARTIAL: "warn",
  RECEIVED: "ok",
  CANCELED: "danger",
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: session } = useSession();
  const canReceive = can(session?.user.role, "item:update");
  const { data, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.get<Detail>(`/api/orders/${id}`),
  });

  const setStatus = useMutation({
    mutationFn: (status: Detail["status"]) => api.patch(`/api/orders/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const send = useMutation({
    mutationFn: () => api.post(`/api/orders/${id}/send`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`PO sent to ${data?.vendorEmail}.`);
    },
    onError: (e) => toast.error(String(e)),
  });

  const receive = useMutation({
    mutationFn: ({ lineId, receivedDelta }: { lineId: string; receivedDelta: number }) =>
      api.post(`/api/orders/${id}/receive`, { lineId, receivedDelta }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Received.");
    },
    onError: (e) => toast.error(String(e)),
  });

  const [confirmAll, setConfirmAll] = useState(false);
  const receiveAll = useMutation({
    mutationFn: () => api.post(`/api/orders/${id}/receive-all`, {}),
    onSuccess: (r) => {
      const result = r as { linesReceived?: number; totalUnits?: number };
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Order received — ${result.totalUnits ?? 0} units across ${result.linesReceived ?? 0} lines.`);
      setConfirmAll(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  const del = useMutation({
    mutationFn: () => api.del(`/api/orders/${id}`),
    onSuccess: () => {
      toast.success("Order deleted.");
      window.location.href = "/orders";
    },
    onError: (e) => toast.error(String(e)),
  });

  function downloadPo() {
    if (!data) return;
    const cols = ["Item", "SKU", "Qty", "Unit $", "Line total"];
    const rows = data.lines.map((l) => [
      l.item?.name ?? l.name,
      l.sku ?? "",
      l.expectedQty,
      l.unitCost != null ? `$${l.unitCost.toFixed(2)}` : "",
      l.unitCost != null ? `$${(l.unitCost * l.expectedQty).toFixed(2)}` : "",
    ]);
    const total = data.lines.reduce((s, l) => s + (l.unitCost ?? 0) * l.expectedQty, 0);
    rows.push(["", "", "", "Order total", `$${total.toFixed(2)}`]);

    const subtitle = [
      `Vendor: ${data.vendor}`,
      data.vendorContact ? `Contact: ${data.vendorContact}` : "",
      data.vendorEmail ?? "",
      data.vendorPhone ?? "",
      data.orderNumber ? `PO #${data.orderNumber}` : "",
      data.expectedAt ? `Need by: ${new Date(data.expectedAt).toLocaleDateString("en-US")}` : "",
      "Ship to: Medics Wisconsin, 1337 Cooke Road, Neenah, WI 54956",
    ].filter(Boolean).join(" · ");

    downloadPdfReport({
      title: `Purchase Order — ${data.vendor}`,
      subtitle,
      filename: `PO-${data.orderNumber ?? data.id}.pdf`,
      columns: cols,
      rows,
      orientation: "portrait",
    });
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  const remainingLines = data.lines.filter((l) => l.expectedQty - l.receivedQty > 0);
  const remainingUnits = remainingLines.reduce((s, l) => s + (l.expectedQty - l.receivedQty), 0);
  const unlinkedRemaining = remainingLines.filter((l) => !l.itemId).length;
  const canReceiveAll =
    data.status !== "RECEIVED" && data.status !== "CANCELED" && data.status !== "DRAFT" && remainingUnits > 0;
  const total = data.lines.reduce((s, l) => s + (l.unitCost ?? 0) * l.expectedQty, 0);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/orders"><ChevronLeft className="h-4 w-4" /> All orders</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant[data.status]}>{data.status}</Badge>
            <Truck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{data.vendor}</span>
            {data.orderNumber && <span className="text-xs text-muted-foreground">#{data.orderNumber}</span>}
            {data.trackingUrl && (
              <a href={data.trackingUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm inline-flex items-center gap-1">
                Tracking <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <h1 className="text-2xl font-bold mt-1">{data.vendor} {data.orderNumber ? `(${data.orderNumber})` : ""}</h1>
          <div className="text-xs text-muted-foreground">
            Created {formatDate(data.orderedAt)}
            {data.sentAt && ` · sent ${formatDate(data.sentAt)}`}
            {data.expectedAt && ` · expected ${formatDateOnly(data.expectedAt)}`}
            {data.receivedAt && ` · received ${formatDate(data.receivedAt)}`}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={downloadPo}>
            <FileText className="h-4 w-4" /> Download PDF
          </Button>
          {data.status === "DRAFT" && (
            <Button
              onClick={() => send.mutate()}
              disabled={send.isPending || !data.vendorEmail}
              title={!data.vendorEmail ? "Add a vendor email to send" : ""}
            >
              <Send className="h-4 w-4" /> Send to vendor
            </Button>
          )}
          {data.status !== "DRAFT" && data.status !== "SHIPPED" && data.status !== "PARTIAL" && data.status !== "RECEIVED" && data.status !== "CANCELED" && (
            <Button variant="outline" onClick={() => setStatus.mutate("SHIPPED")}>Mark shipped</Button>
          )}
          {canReceiveAll && canReceive && (
            <Button onClick={() => setConfirmAll(true)}>
              <CheckCheck className="h-4 w-4" /> Receive full order
            </Button>
          )}
          {data.status !== "CANCELED" && data.status !== "RECEIVED" && (
            <Button
              variant="destructive"
              disabled={setStatus.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: "Cancel this order?",
                  description: "Marks the order CANCELED. Any stock already received stays in inventory — only the remaining open quantities are dropped.",
                  confirmText: "Cancel order",
                  variant: "destructive",
                });
                if (ok) setStatus.mutate("CANCELED");
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </header>

      {/* Vendor + Ship-to */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Vendor</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-y-2 text-sm">
            <Field label="Name">{data.vendor}</Field>
            <Field label="Contact">{data.vendorContact ?? "—"}</Field>
            <Field label="Email">{data.vendorEmail ?? <span className="text-warn">— (required to send PO)</span>}</Field>
            <Field label="Phone">{data.vendorPhone ?? "—"}</Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Ship to</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <div className="font-medium">Medics Wisconsin</div>
            <div>1337 Cooke Road</div>
            <div>Neenah, WI 54956</div>
          </CardContent>
        </Card>
      </div>

      {data.vendorNotes && (
        <Card>
          <CardHeader><CardTitle>Notes for vendor (printed on PO)</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{data.vendorNotes}</CardContent>
        </Card>
      )}
      {data.notes && (
        <Card>
          <CardHeader><CardTitle>Internal notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{data.notes}</CardContent>
        </Card>
      )}

      {confirmAll && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-card border shadow-xl">
            <div className="p-5 border-b flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warn" />
              <div className="font-semibold">Receive everything remaining?</div>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p>
                This will accept <span className="font-semibold">{remainingUnits}</span> units across{" "}
                <span className="font-semibold">{remainingLines.length}</span> open line{remainingLines.length === 1 ? "" : "s"} and mark the
                order <span className="font-semibold">RECEIVED</span>.
              </p>
              <p><span className="font-semibold">Stock will be added automatically</span> for every linked item.</p>
              {unlinkedRemaining > 0 && (
                <div className="rounded-md bg-warn/15 border border-warn/40 p-3 text-xs">
                  <span className="font-semibold">{unlinkedRemaining} line{unlinkedRemaining === 1 ? "" : "s"} not linked to an item</span> —
                  recorded as received but stock won't change. Link them first to update inventory.
                </div>
              )}
              <p className="text-muted-foreground text-xs">Verify against the packing slip before confirming.</p>
            </div>
            <div className="p-5 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmAll(false)}>Cancel</Button>
              <Button onClick={() => receiveAll.mutate()} disabled={receiveAll.isPending}>
                <CheckCheck className="h-4 w-4" /> Confirm receive all
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.lines.map((line) => (
            <ReceiveRow
              // remaining in the key re-seeds the row's local qty input when the server value changes
              key={`${line.id}:${line.expectedQty - line.receivedQty}`}
              line={line}
              onReceive={(delta) => receive.mutate({ lineId: line.id, receivedDelta: delta })}
              disabled={!canReceive || data.status === "DRAFT" || data.status === "RECEIVED" || data.status === "CANCELED"}
            />
          ))}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Order total</span>
            <span className="text-lg font-bold tabular-nums">${total.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="destructive"
          onClick={async () => {
            const ok = await confirm({
              title: "Delete order record?",
              description: "This deletes the PO and its line records. Stock that was already received stays on the items.",
              confirmText: "Delete order",
              variant: "destructive",
            });
            if (ok) del.mutate();
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete order
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function ReceiveRow({
  line,
  onReceive,
  disabled,
}: {
  line: Line;
  onReceive: (delta: number) => void;
  disabled: boolean;
}) {
  const remaining = line.expectedQty - line.receivedQty;
  const [delta, setDelta] = useState<number>(remaining);
  const complete = remaining === 0;

  return (
    <div className={`flex items-center gap-3 rounded-md border p-3 ${complete ? "bg-ok/5 border-ok/40" : ""}`}>
      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {line.item ? <Link className="underline" href={`/items/${line.item.id}`}>{line.item.name}</Link> : line.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {line.sku && <>SKU: {line.sku} · </>}
          Expected: {line.expectedQty} · Received: <span className="font-medium">{line.receivedQty}</span>
          {line.unitCost != null && <> · @ ${line.unitCost.toFixed(2)} = <span className="font-medium">${(line.unitCost * line.expectedQty).toFixed(2)}</span></>}
          {!line.itemId && <span className="ml-2 text-warn">(not linked — won't affect stock)</span>}
        </div>
      </div>
      {!complete && !disabled && (
        <div className="flex items-center gap-2 shrink-0">
          <Input
            type="number"
            min={1}
            max={remaining}
            value={delta}
            onChange={(e) => setDelta(Math.max(1, Math.min(remaining, Number(e.target.value) || 1)))}
            className="h-10 w-20"
          />
          <Button size="sm" onClick={() => onReceive(delta)} disabled={delta < 1 || delta > remaining}>
            <Check className="h-4 w-4" /> Receive
          </Button>
        </div>
      )}
      {complete && <Badge variant="ok">Complete</Badge>}
    </div>
  );
}
