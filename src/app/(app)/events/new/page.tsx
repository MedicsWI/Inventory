"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, X, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const DEFAULT_GEAR = ["Shirt", "Radio", "Cart", "Bag"];

type Tmpl = { id: string; name: string };
type Shift = { name: string; startsAt: string; endsAt: string };

export default function NewEventPage() {
  return (
    <Suspense fallback={null}>
      <NewEventInner />
    </Suspense>
  );
}

function NewEventInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialTemplateId = sp.get("template") ?? "";

  // Templates available for spawning
  const templates = useQuery({
    queryKey: ["event-templates"],
    queryFn: () => api.get<Tmpl[]>("/api/event-templates"),
  });

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [gearCategories, setGearCategories] = useState<string[]>(DEFAULT_GEAR);
  const [newGear, setNewGear] = useState("");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [templateId, setTemplateId] = useState(initialTemplateId);

  // When a template is selected, pull its config and pre-fill the form.
  // Shift times from the template ("HH:MM") get combined with the event's start date
  // (or today if no start date is set yet) to land on a concrete datetime.
  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const t = await api.get<{
        name: string; location: string | null; gearCategories: string[]; notes: string | null;
        shifts: { name: string; startsAtTime: string | null; endsAtTime: string | null }[];
      }>(`/api/event-templates/${templateId}`);
      if (!name) setName(`${t.name} · ${new Date().toLocaleDateString("en-US")}`);
      if (!location && t.location) setLocation(t.location);
      if (gearCategories === DEFAULT_GEAR || gearCategories.length === 0) setGearCategories(t.gearCategories ?? DEFAULT_GEAR);
      if (!notes && t.notes) setNotes(t.notes);

      // Anchor date: event start if user typed one; else today
      const baseDate = startsAt ? new Date(startsAt) : new Date();
      const datePart = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

      setShifts(t.shifts.map((s) => ({
        name: s.name,
        startsAt: s.startsAtTime ? `${datePart}T${s.startsAtTime}` : "",
        endsAt: s.endsAtTime ? `${datePart}T${s.endsAtTime}` : "",
      })));
    })();
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  function addGear() {
    const trimmed = newGear.trim();
    if (!trimmed) return;
    if (gearCategories.some((g) => g.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("That category is already on the list.");
      return;
    }
    setGearCategories([...gearCategories, trimmed]);
    setNewGear("");
  }
  function addShift() {
    setShifts([...shifts, { name: "", startsAt: "", endsAt: "" }]);
  }
  function updateShift(i: number, patch: Partial<Shift>) {
    setShifts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeShift(i: number) {
    setShifts((prev) => prev.filter((_, idx) => idx !== i));
  }

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/api/events", {
        name,
        location: location || null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        notes: notes || null,
        gearCategories,
        templateId: templateId || null,
        shifts: shifts
          .filter((s) => s.name.trim())
          .map((s, i) => ({
            name: s.name.trim(),
            startsAt: s.startsAt ? new Date(s.startsAt).toISOString() : null,
            endsAt: s.endsAt ? new Date(s.endsAt).toISOString() : null,
            sortOrder: i,
          })),
      }),
    onSuccess: (r) => {
      toast.success("Event created.");
      router.push(`/events/${r.id}`);
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">New event</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Start from a template (optional)</CardTitle>
          <CardDescription>
            Templates pre-fill gear categories and shifts.{" "}
            <Link href="/event-templates" className="underline">Manage templates</Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <select className="h-12 w-full rounded-md border bg-background px-3"
            value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">— Start blank —</option>
            {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lambeau game · 11/15" />
          </div>
          <div className="space-y-1">
            <Label>Starts</Label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Ends</Label>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lambeau Field, Section 121" />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Briefing time, weather plan, etc." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shifts (optional)</CardTitle>
          <CardDescription>
            Define shifts upfront if the day has natural breaks (Morning / Midday / Evening).
            People can be assigned to one or more. Skip this if the event is one continuous block.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {shifts.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end pb-2 border-b last:border-none">
              <div className="col-span-12 sm:col-span-4 space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={s.name} onChange={(e) => updateShift(i, { name: e.target.value })} placeholder="Morning" />
              </div>
              <div className="col-span-6 sm:col-span-3 space-y-1">
                <Label className="text-xs">Starts</Label>
                <Input type="datetime-local" value={s.startsAt} onChange={(e) => updateShift(i, { startsAt: e.target.value })} />
              </div>
              <div className="col-span-6 sm:col-span-3 space-y-1">
                <Label className="text-xs">Ends</Label>
                <Input type="datetime-local" value={s.endsAt} onChange={(e) => updateShift(i, { endsAt: e.target.value })} />
              </div>
              <div className="col-span-12 sm:col-span-2 flex justify-end">
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
          <CardTitle>Gear categories</CardTitle>
          <CardDescription>One column on the sign-out sheet per category.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {gearCategories.map((g) => (
              <span key={g} className="inline-flex items-center gap-1 rounded-full border bg-background h-10 pl-3 pr-1 text-sm">
                {g}
                <button
                  type="button"
                  onClick={() => setGearCategories(gearCategories.filter((x) => x !== g))}
                  className="h-8 w-8 grid place-items-center rounded-full hover:bg-accent"
                  aria-label={`Remove ${g}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {gearCategories.length === 0 && (
              <span className="text-xs text-muted-foreground">No categories — add at least one.</span>
            )}
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
        <Button onClick={() => create.mutate()} disabled={!name || gearCategories.length === 0 || create.isPending}>
          Create event
        </Button>
      </div>
    </div>
  );
}

// Convert a Date to the value format <input type="datetime-local"> expects (local TZ).
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
