"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineCreate } from "@/components/quick-create-picker";
import { Plus } from "lucide-react";

type LocationFormValue = {
  id?: string;
  name: string;
  type: "STATION" | "VEHICLE" | "BOX" | "KIT" | "BAG" | "SHELF";
  parentId: string | null;
  barcode: string | null;
  notes: string | null;
};

const TYPES: LocationFormValue["type"][] = ["STATION", "VEHICLE", "BOX", "KIT", "BAG", "SHELF"];

export function LocationForm({ initial, mode }: { initial?: LocationFormValue; mode: "create" | "edit" }) {
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState<LocationFormValue>(
    initial ?? { name: "", type: "STATION", parentId: null, barcode: null, notes: null },
  );
  const [showNewParent, setShowNewParent] = useState(false);

  // Parent picker source — all existing locations except this one (and its descendants — server enforces, UI just filters self).
  const locs = useQuery({
    queryKey: ["locs-flat"],
    queryFn: () => api.get<{ id: string; name: string; type: string }[]>("/api/locations"),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        type: form.type,
        parentId: form.parentId || null,
        barcode: form.barcode || null,
        notes: form.notes || null,
      };
      if (mode === "create") return api.post(`/api/locations`, payload);

      // Edit: diff against the seeded values — a form seeded from a cached
      // read must not clobber fields that changed since it loaded.
      const base = initial!;
      const basePayload = {
        name: base.name,
        type: base.type,
        parentId: base.parentId || null,
        barcode: base.barcode || null,
        notes: base.notes || null,
      };
      const diff: Record<string, unknown> = {};
      for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
        if (payload[key] !== basePayload[key]) diff[key] = payload[key];
      }
      if (Object.keys(diff).length === 0) return Promise.resolve({ id: base.id });
      return api.patch(`/api/locations/${base.id}`, diff);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["locations-tree"] });
      qc.invalidateQueries({ queryKey: ["locs-flat"] });
      const id = (data as { id?: string })?.id ?? initial?.id;
      // The detail page reads ["location", id] — without this it shows pre-save data.
      if (id) qc.invalidateQueries({ queryKey: ["location", id] });
      toast.success(mode === "create" ? "Location created." : "Saved.");
      router.push(id ? `/locations/${id}` : "/locations");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">{mode === "create" ? "New location" : "Edit location"}</h1>
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <Label>Type *</Label>
            <select
              className="h-12 w-full rounded-md border bg-background px-3"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as LocationFormValue["type"] })}
            >
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Parent (optional)</Label>
            <div className="flex gap-2">
              <select
                className="h-12 flex-1 rounded-md border bg-background px-3"
                value={form.parentId ?? ""}
                onChange={(e) => setForm({ ...form, parentId: e.target.value || null })}
              >
                <option value="">— (top level)</option>
                {locs.data
                  ?.filter((l) => l.id !== initial?.id)
                  .map((l) => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
              </select>
              <Button
                type="button"
                size="icon"
                variant={showNewParent ? "default" : "outline"}
                onClick={() => setShowNewParent((v) => !v)}
                aria-label="Create new parent location"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showNewParent && (
              <InlineCreate
                kind="location"
                placeholder="New parent location name"
                className="mt-2"
                onCreated={(created) => {
                  setForm({ ...form, parentId: created.id });
                  setShowNewParent(false);
                }}
              />
            )}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Barcode / QR value (optional)</Label>
            <Input value={form.barcode ?? ""} onChange={(e) => setForm({ ...form, barcode: e.target.value || null })}
              placeholder="e.g. LOC-TRAUMA-KIT-B" />
            <p className="text-xs text-muted-foreground">Used when scanning the label on the box / kit.</p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
          {mode === "create" ? "Create location" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
