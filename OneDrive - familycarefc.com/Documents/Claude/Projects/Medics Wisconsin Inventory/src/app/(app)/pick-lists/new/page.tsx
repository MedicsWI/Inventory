"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type ItemOpt = { id: string; name: string; unit: string | null; quantity: number };
type LocOpt = { id: string; name: string };
type UserOpt = { id: string; name: string | null; email: string };
type Tmpl = { id: string; name: string };
type Line = { itemId: string; requestedQty: number; notes: string };

export default function NewPickListPage() {
  return (
    <Suspense fallback={null}>
      <NewPickListInner />
    </Suspense>
  );
}

function NewPickListInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const items = useQuery({ queryKey: ["items-lookup"], queryFn: () => api.get<ItemOpt[]>("/api/items") });
  const locs = useQuery({ queryKey: ["locs-flat"], queryFn: () => api.get<LocOpt[]>("/api/locations") });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserOpt[]>("/api/users") });
  const templates = useQuery({ queryKey: ["pl-templates"], queryFn: () => api.get<Tmpl[]>("/api/pick-list-templates") });

  const [name, setName] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [destination, setDestination] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [notes, setNotes] = useState("");
  const [templateId, setTemplateId] = useState(sp.get("template") ?? "");
  const [lines, setLines] = useState<Line[]>([{ itemId: "", requestedQty: 1, notes: "" }]);

  // When a template is selected, load its items as the starting line set
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    (async () => {
      const t = await api.get<{ items: { itemId: string; quantity: number; notes: string | null }[] }>(`/api/pick-list-templates/${templateId}`);
      if (cancelled) return;
      if (t.items.length === 0) return;
      setLines(t.items.map((it) => ({ itemId: it.itemId, requestedQty: it.quantity, notes: it.notes ?? "" })));
      if (!name) {
        const tmpl = templates.data?.find((x) => x.id === templateId);
        if (tmpl) setName(`${tmpl.name} — ${new Date().toLocaleDateString()}`);
      }
    })();
    return () => { cancelled = true; };
  }, [templateId, templates.data]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addLine() {
    setLines((prev) => [...prev, { itemId: "", requestedQty: 1, notes: "" }]);
  }

  const create = useMutation({
    mutationFn: () =>
      api.post("/api/pick-lists", {
        name,
        fromLocationId: fromLocationId || null,
        destination: destination || null,
        assignedToId: assignedToId || null,
        notes: notes || null,
        templateId: templateId || null,
        lines: lines
          .filter((l) => l.itemId && l.requestedQty > 0)
          .map((l) => ({
            itemId: l.itemId,
            requestedQty: Number(l.requestedQty),
            notes: l.notes || null,
          })),
      }),
    onSuccess: (r) => {
      const id = (r as { id?: string })?.id;
      toast.success("Pick list created.");
      router.push(id ? `/pick-lists/${id}` : "/pick-lists");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">New pick list</h1>

      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>Start from a template or build a one-off list.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Template (optional)</Label>
            <select className="h-12 w-full rounded-md border bg-background px-3"
              value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— Start blank —</option>
              {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Medic 12 resupply" />
          </div>
          <div className="space-y-1">
            <Label>From location (source of stock)</Label>
            <select className="h-12 w-full rounded-md border bg-background px-3"
              value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)}>
              <option value="">— Anywhere —</option>
              {locs.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Destination (free text)</Label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Medic 12, event prep, etc." />
          </div>
          <div className="space-y-1">
            <Label>Assigned to</Label>
            <select className="h-12 w-full rounded-md border bg-background px-3"
              value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">— pick a person —</option>
              {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-7 space-y-1">
                <Label className="text-xs">Item</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={line.itemId}
                  onChange={(e) => updateLine(i, { itemId: e.target.value })}
                >
                  <option value="">— pick an item —</option>
                  {items.data?.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} (in stock: {it.quantity}{it.unit ? ` ${it.unit}` : ""})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input type="number" min={1} value={line.requestedQty}
                  onChange={(e) => updateLine(i, { requestedQty: Number(e.target.value) || 1 })} />
              </div>
              <div className="col-span-7 sm:col-span-2 space-y-1">
                <Label className="text-xs">Notes</Label>
                <Input value={line.notes} onChange={(e) => updateLine(i, { notes: e.target.value })} />
              </div>
              <div className="col-span-1">
                <Button variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addLine}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button
          onClick={() => create.mutate()}
          disabled={!name || lines.every((l) => !l.itemId) || create.isPending}
        >
          Create pick list
        </Button>
      </div>
    </div>
  );
}
