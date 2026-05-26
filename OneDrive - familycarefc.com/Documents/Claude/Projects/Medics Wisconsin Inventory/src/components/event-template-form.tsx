"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const DEFAULT_GEAR = ["Shirt", "Radio", "Cart", "Bag"];

type Shift = { name: string; startsAtTime: string; endsAtTime: string };

export type EventTemplateFormValue = {
  id?: string;
  name: string;
  description: string;
  location: string;
  notes: string;
  gearCategories: string[];
  shifts: Shift[];
};

export function EventTemplateForm({
  initial,
  mode,
}: {
  initial?: EventTemplateFormValue;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<EventTemplateFormValue>(
    initial ?? {
      name: "",
      description: "",
      location: "",
      notes: "",
      gearCategories: [...DEFAULT_GEAR],
      shifts: [],
    },
  );
  const [newGear, setNewGear] = useState("");

  function addGear() {
    const trimmed = newGear.trim();
    if (!trimmed) return;
    if (form.gearCategories.some((g) => g.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("That category is already on the list.");
      return;
    }
    setForm({ ...form, gearCategories: [...form.gearCategories, trimmed] });
    setNewGear("");
  }
  function addShift() {
    setForm({ ...form, shifts: [...form.shifts, { name: "", startsAtTime: "", endsAtTime: "" }] });
  }
  function updateShift(i: number, patch: Partial<Shift>) {
    setForm({ ...form, shifts: form.shifts.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  }
  function removeShift(i: number) {
    setForm({ ...form, shifts: form.shifts.filter((_, idx) => idx !== i) });
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        description: form.description || null,
        location: form.location || null,
        notes: form.notes || null,
        gearCategories: form.gearCategories,
        shifts: form.shifts
          .filter((s) => s.name.trim())
          .map((s, i) => ({
            name: s.name.trim(),
            startsAtTime: s.startsAtTime || null,
            endsAtTime: s.endsAtTime || null,
            sortOrder: i,
          })),
      };
      return mode === "create"
        ? api.post<{ id: string }>("/api/event-templates", payload)
        : api.patch(`/api/event-templates/${initial!.id}`, payload);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["event-templates"] });
      toast.success(mode === "create" ? "Template created." : "Saved.");
      const id = (r as { id?: string })?.id ?? initial?.id;
      router.push(id ? `/event-templates/${id}` : "/event-templates");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{mode === "create" ? "New event template" : "Edit template"}</h1>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Saturday at Lambeau" />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Default location</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Lambeau Field" />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Default notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shifts</CardTitle>
          <CardDescription>
            Use 24-hour time (e.g. <code>09:00</code> for 9am, <code>20:00</code> for 8pm).
            When you spawn a new event from this template, you'll pick a calendar date and the shift times land on that date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {form.shifts.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end pb-2 border-b last:border-none">
              <div className="col-span-12 sm:col-span-5 space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={s.name} onChange={(e) => updateShift(i, { name: e.target.value })} placeholder="Morning" />
              </div>
              <div className="col-span-5 sm:col-span-3 space-y-1">
                <Label className="text-xs">Starts (24-hr)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  maxLength={5}
                  placeholder="09:00"
                  value={s.startsAtTime}
                  onChange={(e) => updateShift(i, { startsAtTime: e.target.value })}
                />
              </div>
              <div className="col-span-5 sm:col-span-3 space-y-1">
                <Label className="text-xs">Ends (24-hr)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  maxLength={5}
                  placeholder="17:00"
                  value={s.endsAtTime}
                  onChange={(e) => updateShift(i, { endsAtTime: e.target.value })}
                />
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => removeShift(i)} aria-label="Remove shift">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addShift}>
            <Plus className="h-4 w-4" /> Add shift
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default gear categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {form.gearCategories.map((g) => (
              <span key={g} className="inline-flex items-center gap-1 rounded-full border bg-background h-10 pl-3 pr-1 text-sm">
                {g}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, gearCategories: form.gearCategories.filter((x) => x !== g) })}
                  className="h-8 w-8 grid place-items-center rounded-full hover:bg-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newGear} onChange={(e) => setNewGear(e.target.value)} placeholder="e.g. AED"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGear(); } }} />
            <Button type="button" variant="outline" onClick={addGear} disabled={!newGear.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
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
