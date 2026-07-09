"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Send, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type ItemLookup = { id: string; name: string; sku: string | null }[];
type Line = {
  itemId: string;
  name: string;
  sku: string;
  expectedQty: number;
  unitCost: number | "";
};

export default function NewOrderPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const items = useQuery({
    queryKey: ["items-lookup"],
    queryFn: () => api.get<ItemLookup>("/api/items"),
  });

  const [vendor, setVendor] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorContact, setVendorContact] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [vendorNotes, setVendorNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ itemId: "", name: "", sku: "", expectedQty: 1, unitCost: "" }]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }
  function addLine() { setLines((prev) => [...prev, { itemId: "", name: "", sku: "", expectedQty: 1, unitCost: "" }]); }

  const lineTotal = (l: Line) =>
    typeof l.unitCost === "number" ? l.unitCost * Number(l.expectedQty) : 0;
  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  const create = useMutation({
    mutationFn: (status: "DRAFT" | "ORDERED") =>
      api.post<{ id: string }>("/api/orders", {
        vendor,
        vendorEmail: vendorEmail || null,
        vendorContact: vendorContact || null,
        vendorPhone: vendorPhone || null,
        orderNumber: orderNumber || null,
        trackingUrl: trackingUrl || null,
        expectedAt: expectedAt ? new Date(expectedAt).toISOString() : null,
        notes: notes || null,
        vendorNotes: vendorNotes || null,
        status,
        lines: lines
          .filter((l) => l.name.trim() && l.expectedQty > 0)
          .map((l) => ({
            itemId: l.itemId || null,
            name: l.name,
            sku: l.sku || null,
            expectedQty: Number(l.expectedQty),
            unitCost: l.unitCost === "" ? null : Number(l.unitCost),
          })),
      }),
    onSuccess: (r, status) => {
      toast.success(status === "DRAFT" ? "Saved as draft." : "Saved.");
      qc.invalidateQueries({ queryKey: ["orders"] });
      router.push(`/orders/${r.id}`);
    },
    onError: (e) => toast.error(String(e)),
  });

  // "Save & send" = save as DRAFT, then immediately call /send
  const saveAndSend = useMutation({
    mutationFn: async (): Promise<{ id: string; sendError?: string }> => {
      if (!vendorEmail) throw new Error("Add a vendor email before sending.");
      const created = await api.post<{ id: string }>("/api/orders", {
        vendor,
        vendorEmail,
        vendorContact: vendorContact || null,
        vendorPhone: vendorPhone || null,
        orderNumber: orderNumber || null,
        trackingUrl: trackingUrl || null,
        expectedAt: expectedAt ? new Date(expectedAt).toISOString() : null,
        notes: notes || null,
        vendorNotes: vendorNotes || null,
        status: "DRAFT",
        lines: lines
          .filter((l) => l.name.trim() && l.expectedQty > 0)
          .map((l) => ({
            itemId: l.itemId || null,
            name: l.name,
            sku: l.sku || null,
            expectedQty: Number(l.expectedQty),
            unitCost: l.unitCost === "" ? null : Number(l.unitCost),
          })),
      });
      // Order exists at this point — if sending fails, don't lose it. Surface the
      // failure but still route the user to the saved draft.
      try {
        await api.post(`/api/orders/${created.id}/send`, {});
      } catch (e) {
        return { id: created.id, sendError: String(e) };
      }
      return { id: created.id };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      if (r.sendError) {
        toast.error(`Order saved as draft — sending failed: ${r.sendError}`);
      } else {
        toast.success(`Sent to ${vendorEmail}.`);
      }
      router.push(`/orders/${r.id}`);
    },
    onError: (e) => toast.error(String(e)),
  });

  const submitDisabled =
    !vendor || lines.every((l) => !l.name.trim()) || create.isPending || saveAndSend.isPending;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">New purchase order</h1>

      <Card>
        <CardHeader>
          <CardTitle>Vendor</CardTitle>
          <CardDescription>
            Email is required to <span className="font-medium">send</span> the PO. You can also save as a draft without sending.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Vendor *</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Bound Tree, Henry Schein, etc." />
          </div>
          <div className="space-y-1">
            <Label>Vendor email (to send to)</Label>
            <Input type="email" value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} placeholder="orders@vendor.com" />
          </div>
          <div className="space-y-1">
            <Label>Contact name</Label>
            <Input value={vendorContact} onChange={(e) => setVendorContact(e.target.value)} placeholder="Sales rep, account manager…" />
          </div>
          <div className="space-y-1">
            <Label>Vendor phone</Label>
            <Input value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Order details</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>PO number (your reference)</Label>
            <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="MW-2026-001" />
          </div>
          <div className="space-y-1">
            <Label>Need by</Label>
            <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Notes for vendor (printed on PO)</Label>
            <Textarea value={vendorNotes} onChange={(e) => setVendorNotes(e.target.value)} placeholder="Delivery instructions, special handling, etc." />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Internal notes (not on PO)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything you want to remember about this order" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <CardDescription>
            Link to an inventory item where possible — receiving will then update stock automatically.
            <span className="block mt-1">
              <span className="font-medium">Price per unit</span> is optional. Fill it in if you want a line total + grand total on the PO; leave blank if pricing isn't known yet.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end pb-3 border-b last:border-none">
              {/* Row 1: item picker + name */}
              <div className="col-span-12 sm:col-span-5 space-y-1">
                <Label className="text-xs">Item (existing — optional)</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={line.itemId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const it = items.data?.find((i) => i.id === id);
                    updateLine(i, {
                      itemId: id,
                      name: it?.name ?? line.name,
                      sku: it?.sku ?? line.sku,
                    });
                  }}
                >
                  <option value="">— New / unlinked —</option>
                  {items.data?.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-7 space-y-1">
                <Label className="text-xs">Name / description</Label>
                <Input value={line.name} onChange={(e) => updateLine(i, { name: e.target.value })} />
              </div>

              {/* Row 2: SKU, Qty, Price, Total, Delete */}
              <div className="col-span-12 sm:col-span-3 space-y-1">
                <Label className="text-xs">SKU</Label>
                <Input value={line.sku} onChange={(e) => updateLine(i, { sku: e.target.value })} />
              </div>
              <div className="col-span-3 sm:col-span-2 space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={line.expectedQty}
                  onChange={(e) => updateLine(i, { expectedQty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
                  className="tabular-nums"
                />
              </div>
              <div className="col-span-4 sm:col-span-3 space-y-1">
                <Label className="text-xs">Price per unit ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  inputMode="decimal"
                  value={line.unitCost}
                  onChange={(e) => updateLine(i, { unitCost: e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0) })}
                  placeholder="optional"
                  className="tabular-nums"
                />
              </div>
              <div className="col-span-4 sm:col-span-3 space-y-1">
                <Label className="text-xs">Line total</Label>
                <div className="h-10 px-2 grid items-center justify-end text-sm font-semibold tabular-nums">
                  {lineTotal(line) > 0 ? `$${lineTotal(line).toFixed(2)}` : <span className="text-muted-foreground font-normal">—</span>}
                </div>
              </div>
              <div className="col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1} aria-label="Remove line">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="outline" onClick={addLine}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Order total</div>
              <div className="text-xl font-bold tabular-nums">${grandTotal.toFixed(2)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button variant="outline" onClick={() => create.mutate("DRAFT")} disabled={submitDisabled}>
          <Save className="h-4 w-4" /> Save as draft
        </Button>
        <Button
          onClick={() => saveAndSend.mutate()}
          disabled={submitDisabled || !vendorEmail}
          title={!vendorEmail ? "Add a vendor email to send" : ""}
        >
          <Send className="h-4 w-4" /> Save & send to vendor
        </Button>
      </div>
    </div>
  );
}
