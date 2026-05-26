"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Pencil, Trash2, Sparkles, Calendar } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useConfirm } from "@/components/dialog-provider";

type Detail = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  gearCategories: string[];
  notes: string | null;
  shifts: {
    id: string;
    name: string;
    startsAtTime: string | null;
    endsAtTime: string | null;
    sortOrder: number;
  }[];
};

export default function EventTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({
    queryKey: ["event-template", id],
    queryFn: () => api.get<Detail>(`/api/event-templates/${id}`),
  });

  const [spawnDate, setSpawnDate] = useState("");
  const [spawnName, setSpawnName] = useState("");
  const spawn = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>(`/api/event-templates/${id}/spawn`, {
        name: spawnName || undefined,
        date: spawnDate,
      }),
    onSuccess: (r) => {
      toast.success("Event created.");
      window.location.href = `/events/${r.id}`;
    },
    onError: (e) => toast.error(String(e)),
  });

  const del = useMutation({
    mutationFn: () => api.del(`/api/event-templates/${id}`),
    onSuccess: () => {
      toast.success("Template deleted.");
      window.location.href = "/event-templates";
    },
    onError: (e) => toast.error(String(e)),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/event-templates"><ChevronLeft className="h-4 w-4" /> Templates</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.name}</h1>
          {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
          {data.location && <p className="text-xs text-muted-foreground mt-1">Default location: {data.location}</p>}
        </div>
        <Button asChild variant="outline">
          <Link href={`/event-templates/${id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Spawn new event from this template</CardTitle>
          <CardDescription>
            Pick the date. Each shift's time-of-day lands on that date automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Event date *</Label>
              <Input type="date" value={spawnDate} onChange={(e) => setSpawnDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Name (optional)</Label>
              <Input value={spawnName} onChange={(e) => setSpawnName(e.target.value)} placeholder={`${data.name} · auto-date`} />
            </div>
          </div>
          <Button onClick={() => spawn.mutate()} disabled={!spawnDate || spawn.isPending}>
            <Calendar className="h-4 w-4" /> Spawn event
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Shifts ({data.shifts.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.shifts.length === 0 && <div className="text-muted-foreground">No shifts defined.</div>}
          {data.shifts.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {s.startsAtTime ?? "—"}
                {s.endsAtTime != null && ` – ${s.endsAtTime}`}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Default gear ({data.gearCategories.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {data.gearCategories.map((g) => (
              <span key={g} className="rounded-full border bg-background h-10 px-3 text-sm inline-flex items-center">{g}</span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="destructive"
          onClick={async () => {
            const ok = await confirm({
              title: "Delete template?",
              description: "Events already spawned from this template stay; only this template is removed.",
              confirmText: "Delete template",
              variant: "destructive",
            });
            if (ok) del.mutate();
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}
