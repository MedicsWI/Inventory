"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoPicker } from "@/components/photo-picker";
import { InlineCreate } from "@/components/quick-create-picker";
import { Plus } from "lucide-react";

type Lookup = { id: string; name: string }[];

export type ItemFormValue = {
  id?: string;
  name: string;
  description: string;
  barcode: string;
  sku: string;
  quantity: number;
  unit: string;
  lotNumber: string;
  expirationDate: string;            // yyyy-MM-dd or ""
  lowStockThreshold: number | "";
  locationId: string;
  categoryId: string;
  notes: string;
  photoUrl: string | null;
  returnable: boolean;
  tileDeviceId: string;
  tagIds: string[];
};

const empty: ItemFormValue = {
  name: "",
  description: "",
  barcode: "",
  sku: "",
  quantity: 0,
  unit: "each",
  lotNumber: "",
  expirationDate: "",
  lowStockThreshold: "",
  locationId: "",
  categoryId: "",
  notes: "",
  photoUrl: null,
  returnable: false,
  tileDeviceId: "",
  tagIds: [],
};

function buildPayload(v: ItemFormValue) {
  return {
    name: v.name,
    description: v.description || null,
    barcode: v.barcode || null,
    sku: v.sku || null,
    quantity: Number(v.quantity) || 0,
    unit: v.unit || null,
    lotNumber: v.lotNumber || null,
    expirationDate: v.expirationDate ? new Date(v.expirationDate).toISOString() : null,
    lowStockThreshold: v.lowStockThreshold === "" ? null : Number(v.lowStockThreshold),
    locationId: v.locationId || null,
    categoryId: v.categoryId || null,
    notes: v.notes || null,
    photoUrl: v.photoUrl,
    returnable: v.returnable,
    tileDeviceId: v.tileDeviceId.trim() || null,
    tagIds: v.tagIds,
  };
}

export function ItemForm({ initial, mode }: { initial?: ItemFormValue; mode: "create" | "edit" }) {
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState<ItemFormValue>(initial ?? empty);

  const cats = useQuery({ queryKey: ["cats"], queryFn: () => api.get<Lookup>("/api/categories") });
  const locs = useQuery({ queryKey: ["locs-flat"], queryFn: () => api.get<Lookup>("/api/locations") });
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => api.get<{ id: string; name: string; color: string | null }[]>("/api/tags") });
  const [newTagName, setNewTagName] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewLocation, setShowNewLocation] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const payload = buildPayload(form);
      if (mode === "create") return api.post("/api/items", payload);

      // EDIT: send only the fields the user actually changed. The form is
      // seeded once from (possibly cached) data — PATCHing the full payload
      // silently reverts anything that changed since it loaded (location
      // moves, quantity adjustments, checkouts). Diffing prevents that.
      const base = buildPayload(initial ?? empty);
      const diff: Record<string, unknown> = {};
      for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
        const next = payload[key];
        const prev = base[key];
        const changed = Array.isArray(next)
          ? JSON.stringify([...next].sort()) !== JSON.stringify([...(prev as string[])].sort())
          : next !== prev;
        if (changed) diff[key] = next;
      }
      if (Object.keys(diff).length === 0) return Promise.resolve({ id: initial!.id });
      return api.patch(`/api/items/${initial!.id}`, diff);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["item", initial?.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(mode === "create" ? "Item created." : "Saved.");
      const id = (data as { id?: string })?.id ?? initial?.id;
      router.push(id ? `/items/${id}` : "/items");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{mode === "create" ? "New item" : "Edit item"}</h1>
      <Card>
        <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="Name *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Category">
            <div className="flex gap-2">
              <select
                className="h-12 flex-1 rounded-md border bg-background px-3"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">—</option>
                {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button
                type="button"
                size="icon"
                variant={showNewCategory ? "default" : "outline"}
                onClick={() => setShowNewCategory((v) => !v)}
                aria-label="Create new category"
                title="Create new category"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showNewCategory && (
              <InlineCreate
                kind="category"
                placeholder="New category name"
                className="mt-2"
                onCreated={(created) => {
                  setForm({ ...form, categoryId: created.id });
                  setShowNewCategory(false);
                }}
              />
            )}
          </Field>
          <Field label="Location">
            <div className="flex gap-2">
              <select
                className="h-12 flex-1 rounded-md border bg-background px-3"
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              >
                <option value="">—</option>
                {locs.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <Button
                type="button"
                size="icon"
                variant={showNewLocation ? "default" : "outline"}
                onClick={() => setShowNewLocation((v) => !v)}
                aria-label="Create new location"
                title="Create new location"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showNewLocation && (
              <InlineCreate
                kind="location"
                placeholder="New location name (pick type →)"
                className="mt-2"
                onCreated={(created) => {
                  setForm({ ...form, locationId: created.id });
                  setShowNewLocation(false);
                }}
              />
            )}
          </Field>
          <Field label="Quantity">
            <Input type="number" min={0} value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          </Field>
          <Field label="Unit">
            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </Field>
          <Field label="Low-stock threshold">
            <Input type="number" min={0} value={form.lowStockThreshold}
              onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value === "" ? "" : Number(e.target.value) })} />
          </Field>
          <Field label="Barcode / QR value">
            <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </Field>
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </Field>
          <Field label="Lot number">
            <Input value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })} />
          </Field>
          <Field label="Expiration date">
            <Input type="date" value={form.expirationDate}
              onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Tile tracker ID">
              <Input
                value={form.tileDeviceId}
                onChange={(e) => setForm({ ...form, tileDeviceId: e.target.value })}
                placeholder="Tile device ID from the ops hub Tile Trackers registry"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Links this asset (AED, med cart, equipment) to its Bluetooth tracker. Copy the
                device ID from the ops hub <span className="font-medium">Tile Trackers</span> page.
                One tracker per item.
              </p>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={form.returnable}
                onChange={(e) => setForm({ ...form, returnable: e.target.checked })}
              />
              <div>
                <div className="font-medium">Returnable equipment</div>
                <p className="text-xs text-muted-foreground">
                  Check for equipment that's borrowed and returned (BP cuff, glucometer, radio).
                  Leave unchecked for consumables (bandages, IV fluids, meds).
                </p>
              </div>
            </label>
          </div>

          <div className="sm:col-span-2">
            <Field label="Tags">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {tags.data?.map((t) => {
                    const active = form.tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            tagIds: active
                              ? form.tagIds.filter((id) => id !== t.id)
                              : [...form.tagIds, t.id],
                          })
                        }
                        className={
                          // Glove-friendly tap target: 40px tall, larger padding
                          "rounded-full border px-4 h-10 text-sm transition-colors inline-flex items-center " +
                          (active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-accent")
                        }
                      >
                        {t.name}
                      </button>
                    );
                  })}
                  {tags.data?.length === 0 && (
                    <span className="text-xs text-muted-foreground">No tags yet — create one below.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="New tag (e.g. ALS, BLS, controlled, perishable)"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={addingTag}
                    onClick={async () => {
                      const trimmed = newTagName.trim();
                      if (!trimmed || addingTag) return;
                      setAddingTag(true);
                      try {
                        const created = await api.post<{ id: string; name: string }>("/api/tags", { name: trimmed });
                        setNewTagName("");
                        setForm({ ...form, tagIds: [...form.tagIds, created.id] });
                        tags.refetch();
                      } catch (e) {
                        toast.error(String(e));
                      } finally {
                        setAddingTag(false);
                      }
                    }}
                  >
                    Add tag
                  </Button>
                </div>
              </div>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Photo">
              <PhotoPicker
                value={form.photoUrl}
                onChange={(url) => setForm({ ...form, photoUrl: url })}
                folder="items"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
          {mode === "create" ? "Create item" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
