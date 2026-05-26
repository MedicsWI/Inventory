"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ItemOpt = { id: string; name: string; unit: string | null };
type Line = { itemId: string; quantity: number; notes: string };

export type TemplateFormValue = {
  id?: string;
  name: string;
  description: string;
  items: Line[];
};

export function PickListTemplateForm({
  initial,
  mode,
}: {
  initial?: TemplateFormValue;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const items = useQuery({
    queryKey: ["items-lookup"],
    queryFn: () => api.get<ItemOpt[]>("/api/items"),
  });

  const [form, setForm] = useState<TemplateFormValue>(
    initial ?? { name: "", description: "", items: [{ itemId: "", quantity: 1, notes: "" }] },
  );

  function updateLine(i: number, patch: Partial<Line>) {
    setForm((p) => ({ ...p, items: p.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  }
  function removeLine(i: number) {
    setForm((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  }
  function addLine() {
    setForm((p) => ({ ...p, items: [...p.items, { itemId: "", quantity: 1, notes: "" }] }));
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        description: form.description || null,
        items: form.items
          .filter((l) => l.itemId && l.quantity > 0)
          .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), notes: l.notes || null })),
      };
      return mode === "create"
        ? api.post("/api/pick-list-templates", payload)
        : api.patch(`/api/pick-list-templates/${initial!.id}`, payload);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["pl-templates"] });
      toast.success(mode === "create" ? "Template created." : "Saved.");
      const id = (r as { id?: string })?.id ?? initial?.id;
      router.push(id ? `/pick-list-templates/${id}` : "/pick-list-templates");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">{mode === "create" ? "New template" : "Edit template"}</h1>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Trauma Kit A weekly resupply" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {form.items.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-7 space-y-1">
                <Label className="text-xs">Item</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={line.itemId}
                  onChange={(e) => updateLine(i, { itemId: e.target.value })}
                >
                  <option value="">— pick an item —</option>
                  {items.data?.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input type="number" min={1} value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 1 })} />
              </div>
              <div className="col-span-7 sm:col-span-2 space-y-1">
                <Label className="text-xs">Notes</Label>
                <Input value={line.notes} onChange={(e) => updateLine(i, { notes: e.target.value })} />
              </div>
              <div className="col-span-1">
                <Button variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={form.items.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addLine}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
          {mode === "create" ? "Create template" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
