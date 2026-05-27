"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Plus, Trash2, Play, Check, CalendarDays, FileText, X,
  CircleCheck, CircleDot, Circle, History, ChevronDown, Undo2, Tablet,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfirm, usePrompt } from "@/components/dialog-provider";
import { EventGearDialog, type GearDialogSubmit } from "@/components/event-gear-dialog";
import { downloadPdfReport } from "@/lib/pdf";
import { formatDate, cn } from "@/lib/utils";

type Cycle = {
  id: string;
  category: string;
  shift: string | null;
  identifier: string | null;
  outAt: string | null;
  inAt: string | null;
  outInitials: string | null;
  inInitials: string | null;
  notes: string | null;
};
type SignOut = {
  id: string;
  personName: string;
  role: string | null;
  notes: string | null;
  shifts: string[];
  items: Cycle[];
  user: { id: string; name: string | null; email: string } | null;
};
type Shift = {
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
};
type EventDetail = {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "CLOSED" | "CANCELED";
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  gearCategories: string[];
  shifts: Shift[];
  signOuts: SignOut[];
  template: { id: string; name: string } | null;
};

const statusVariant: Record<EventDetail["status"], "outline" | "warn" | "ok" | "danger"> = {
  PLANNED: "outline",
  ACTIVE: "warn",
  CLOSED: "ok",
  CANCELED: "danger",
};

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { data, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.get<EventDetail>(`/api/events/${id}`),
  });

  // ALL or a specific shift name. Drives the people filter and which shift OUT defaults to.
  const [shiftFilter, setShiftFilter] = useState<string | "ALL">("ALL");

  const setStatus = useMutation({
    mutationFn: (status: EventDetail["status"]) => api.patch(`/api/events/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id] }),
    onError: (e) => toast.error(String(e)),
  });

  const addPerson = useMutation({
    mutationFn: ({ name, shifts }: { name: string; shifts: string[] }) =>
      api.post(`/api/events/${id}/sign-outs`, { personName: name, role: "VOLUNTEER", shifts }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id] }),
    onError: (e) => toast.error(String(e)),
  });

  const newCycle = useMutation({
    mutationFn: (vars: { soId: string; category: string; shift?: string | null; identifier?: string | null; initials?: string | null; photoUrl?: string | null }) =>
      api.post(`/api/events/${id}/sign-outs/${vars.soId}/items`, {
        category: vars.category,
        shift: vars.shift ?? null,
        identifier: vars.identifier ?? null,
        initials: vars.initials ?? null,
        photoUrl: vars.photoUrl ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id] }),
    onError: (e) => toast.error(String(e)),
  });

  const markIn = useMutation({
    mutationFn: (vars: { soId: string; itemId: string; initials?: string | null; photoUrl?: string | null }) =>
      api.patch(`/api/events/${id}/sign-outs/${vars.soId}/items/${vars.itemId}`, {
        action: "mark-in",
        initials: vars.initials ?? null,
        photoUrl: vars.photoUrl ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id] }),
    onError: (e) => toast.error(String(e)),
  });

  const resetCycle = useMutation({
    mutationFn: (vars: { soId: string; itemId: string }) =>
      api.del(`/api/events/${id}/sign-outs/${vars.soId}/items/${vars.itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id] }),
  });

  const setSignOutShifts = useMutation({
    mutationFn: (vars: { soId: string; shifts: string[] }) =>
      api.patch(`/api/events/${id}/sign-outs/${vars.soId}`, { shifts: vars.shifts }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id] }),
  });

  const removePerson = useMutation({
    mutationFn: (soId: string) => api.del(`/api/events/${id}/sign-outs/${soId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id] }),
  });

  const delEvent = useMutation({
    mutationFn: () => api.del(`/api/events/${id}`),
    onSuccess: () => { toast.success("Event deleted."); window.location.href = "/events"; },
    onError: (e) => toast.error(String(e)),
  });

  const [newPerson, setNewPerson] = useState("");

  // Gear capture dialog state — open when the user taps an empty cell or an open cycle
  const [gearDialog, setGearDialog] = useState<
    | { mode: "out"; soId: string; personName: string; category: string; shift: string | null }
    | { mode: "in"; soId: string; itemId: string; personName: string; category: string; identifier: string | null; outAt: string | null }
    | null
  >(null);

  function handleGearSubmit(vals: GearDialogSubmit) {
    if (!gearDialog) return;
    if (gearDialog.mode === "out") {
      newCycle.mutate({
        soId: gearDialog.soId,
        category: gearDialog.category,
        shift: gearDialog.shift,
        identifier: vals.identifier ?? null,
        initials: vals.initials ?? null,
        photoUrl: vals.photoUrl ?? null,
      }, { onSuccess: () => setGearDialog(null) });
    } else {
      markIn.mutate({
        soId: gearDialog.soId,
        itemId: gearDialog.itemId,
        initials: vals.initials ?? null,
        photoUrl: vals.photoUrl ?? null,
      }, { onSuccess: () => setGearDialog(null) });
    }
  }

  // Filter people by shift
  const visiblePeople = useMemo(() => {
    if (!data) return [];
    if (shiftFilter === "ALL") return data.signOuts;
    return data.signOuts.filter((s) => s.shifts.includes(shiftFilter));
  }, [data, shiftFilter]);

  function downloadSheet() {
    if (!data) return;
    const cols = ["Name", "Shifts", ...data.gearCategories.flatMap((g) => [`${g} OUT`, `${g} IN`])];
    const rows = data.signOuts.map((s) => {
      const row: (string | number)[] = [s.personName, s.shifts.join(", ")];
      for (const g of data.gearCategories) {
        const cycles = s.items.filter((x) => x.category === g);
        const outs = cycles.map((c) => c.outAt ? new Date(c.outAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) + (c.identifier ? ` (${c.identifier})` : "") : "").filter(Boolean).join("; ");
        const ins = cycles.map((c) => c.inAt ? new Date(c.inAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "").filter(Boolean).join("; ");
        row.push(outs, ins);
      }
      return row;
    });
    downloadPdfReport({
      title: `Equipment Sign-Out — ${data.name}`,
      subtitle: [
        data.startsAt ? `Date: ${new Date(data.startsAt).toLocaleString("en-US")}` : "",
        data.location ?? "",
      ].filter(Boolean).join(" · "),
      filename: `event-${data.id}.pdf`,
      columns: cols,
      rows,
      orientation: "landscape",
    });
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/events"><ChevronLeft className="h-4 w-4" /> All events</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant[data.status]}>{data.status}</Badge>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {data.startsAt && <span className="text-sm text-muted-foreground">{formatDate(data.startsAt)}</span>}
            {data.template && <Badge variant="outline">from {data.template.name}</Badge>}
          </div>
          <h1 className="text-2xl font-bold mt-1">{data.name}</h1>
          {data.location && <div className="text-sm text-muted-foreground">{data.location}</div>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {data.status === "PLANNED" && (
            <Button onClick={() => setStatus.mutate("ACTIVE")}>
              <Play className="h-4 w-4" /> Start event
            </Button>
          )}
          {data.status === "ACTIVE" && (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Undo start?",
                    description: "Set this event back to Planned. Sign-out activity already recorded stays intact — only the status changes.",
                    confirmText: "Undo start",
                  });
                  if (ok) setStatus.mutate("PLANNED");
                }}
              >
                <Undo2 className="h-4 w-4" /> Undo start
              </Button>
              <Button onClick={() => setStatus.mutate("CLOSED")}>
                <Check className="h-4 w-4" /> Close event
              </Button>
            </>
          )}
          <Button asChild variant="outline">
            <Link href={`/events/${id}/kiosk`}>
              <Tablet className="h-4 w-4" /> Open kiosk
            </Link>
          </Button>
          <Button variant="outline" onClick={downloadSheet}>
            <FileText className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </header>

      {data.notes && (
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{data.notes}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sign-out sheet</CardTitle>
          <CardDescription>
            Tap a gear cell to sign <strong>OUT</strong>. Tap an open cycle to sign <strong>IN</strong>.
            One cell can have many OUT/IN cycles (when gear is handed off mid-day).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Shift filter tabs */}
          {data.shifts.length > 0 && (
            <div className="flex gap-2 flex-wrap border-b pb-2">
              <Button
                variant={shiftFilter === "ALL" ? "default" : "outline"}
                size="sm"
                onClick={() => setShiftFilter("ALL")}
              >
                All shifts ({data.signOuts.length})
              </Button>
              {data.shifts.map((sh) => {
                const count = data.signOuts.filter((s) => s.shifts.includes(sh.name)).length;
                return (
                  <Button
                    key={sh.id}
                    variant={shiftFilter === sh.name ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShiftFilter(sh.name)}
                  >
                    {sh.name}
                    {sh.startsAt && (
                      <span className="ml-1 text-xs opacity-70">
                        {new Date(sh.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                    <span className="ml-1 text-xs opacity-70">· {count}</span>
                  </Button>
                );
              })}
            </div>
          )}

          {/* Add person form */}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newPerson.trim();
              if (!trimmed) return;
              // Auto-assign to active shift filter if one is selected
              const initialShifts = shiftFilter === "ALL" ? [] : [shiftFilter];
              addPerson.mutate({ name: trimmed, shifts: initialShifts });
              setNewPerson("");
            }}
          >
            <Input
              value={newPerson}
              onChange={(e) => setNewPerson(e.target.value)}
              placeholder={
                shiftFilter === "ALL"
                  ? "Add a person — type their name"
                  : `Add to ${shiftFilter} — type their name`
              }
            />
            <Button type="submit" disabled={!newPerson.trim() || addPerson.isPending}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>

          {visiblePeople.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              {shiftFilter === "ALL"
                ? "No one signed in yet."
                : `No one assigned to ${shiftFilter} yet.`}
            </div>
          )}

          {/* Desktop table */}
          {visiblePeople.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3 sticky left-0 bg-card min-w-[180px]">Person</th>
                    {data.gearCategories.map((g) => (
                      <th key={g} className="py-2 px-2 text-center min-w-[140px]">{g}</th>
                    ))}
                    <th className="py-2 pr-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePeople.map((s) => (
                    <tr key={s.id} className="border-b last:border-none align-top">
                      <td className="py-2 pr-3 font-medium sticky left-0 bg-card">
                        <div>{s.personName}</div>
                        <ShiftPicker
                          allShifts={data.shifts.map((sh) => sh.name)}
                          selected={s.shifts}
                          onChange={(shifts) => setSignOutShifts.mutate({ soId: s.id, shifts })}
                        />
                        {s.role && <div className="text-xs text-muted-foreground mt-1">{s.role}</div>}
                      </td>
                      {data.gearCategories.map((g) => {
                        const cycles = s.items.filter((x) => x.category === g);
                        return (
                          <td key={g} className="py-2 px-1 text-center">
                            <GearCellStack
                              cycles={cycles}
                              activeShift={shiftFilter === "ALL" ? null : shiftFilter}
                              busy={newCycle.isPending || markIn.isPending}
                              onNewOut={() => setGearDialog({
                                mode: "out",
                                soId: s.id,
                                personName: s.personName,
                                category: g,
                                shift: shiftFilter === "ALL" ? null : shiftFilter,
                              })}
                              onMarkIn={(itemId, identifier, outAt) => setGearDialog({
                                mode: "in",
                                soId: s.id,
                                itemId,
                                personName: s.personName,
                                category: g,
                                identifier,
                                outAt,
                              })}
                              onReset={(itemId) => resetCycle.mutate({ soId: s.id, itemId })}
                            />
                          </td>
                        );
                      })}
                      <td className="py-2 pr-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Remove ${s.personName}?`,
                              description: "Their sign-out row will be deleted from this event.",
                              confirmText: "Remove",
                              variant: "destructive",
                            });
                            if (ok) removePerson.mutate(s.id);
                          }}
                          aria-label="Remove person"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile card per person */}
          {visiblePeople.length > 0 && (
            <div className="md:hidden space-y-3">
              {visiblePeople.map((s) => (
                <div key={s.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.personName}</div>
                      <ShiftPicker
                        allShifts={data.shifts.map((sh) => sh.name)}
                        selected={s.shifts}
                        onChange={(shifts) => setSignOutShifts.mutate({ soId: s.id, shifts })}
                      />
                      {s.role && <div className="text-xs text-muted-foreground mt-1">{s.role}</div>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Remove ${s.personName}?`,
                          description: "Their sign-out row will be deleted.",
                          confirmText: "Remove",
                          variant: "destructive",
                        });
                        if (ok) removePerson.mutate(s.id);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {data.gearCategories.map((g) => {
                      const cycles = s.items.filter((x) => x.category === g);
                      return (
                        <div key={g} className="rounded-md border p-2 space-y-1">
                          <div className="text-xs text-muted-foreground uppercase tracking-wide text-center">{g}</div>
                          <GearCellStack
                            cycles={cycles}
                            activeShift={shiftFilter === "ALL" ? null : shiftFilter}
                            busy={newCycle.isPending || markIn.isPending}
                            onNewOut={() => newCycle.mutate({ soId: s.id, category: g, shift: shiftFilter === "ALL" ? null : shiftFilter })}
                            onMarkIn={(itemId) => markIn.mutate({ soId: s.id, itemId })}
                            onReset={(itemId) => resetCycle.mutate({ soId: s.id, itemId })}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="destructive"
          onClick={async () => {
            const ok = await confirm({
              title: "Delete this event?",
              description: "All sign-out rows for this event will be deleted. This can't be undone.",
              confirmText: "Delete event",
              variant: "destructive",
            });
            if (ok) delEvent.mutate();
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete event
        </Button>
      </div>

      {gearDialog && (
        <EventGearDialog
          open
          mode={gearDialog.mode}
          category={gearDialog.category}
          personName={gearDialog.personName}
          context={
            gearDialog.mode === "in"
              ? { identifier: gearDialog.identifier, outAt: gearDialog.outAt }
              : undefined
          }
          busy={newCycle.isPending || markIn.isPending}
          onClose={() => setGearDialog(null)}
          onSubmit={handleGearSubmit}
        />
      )}
    </div>
  );
}

// Multi-cycle gear cell. Shows the latest cycle prominently with a history disclosure
// when there are 2+ cycles. Tapping the open cycle marks IN. Tapping "New OUT" creates
// a new cycle for the active shift filter.
function GearCellStack({
  cycles,
  activeShift,
  busy,
  onNewOut,
  onMarkIn,
  onReset,
}: {
  cycles: Cycle[];
  activeShift: string | null;
  busy: boolean;
  onNewOut: () => void;
  onMarkIn: (itemId: string, identifier: string | null, outAt: string | null) => void;
  onReset: (itemId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Latest cycle is at the bottom of the sorted list (createdAt asc)
  const latest = cycles[cycles.length - 1];
  const hasOpen = latest && latest.outAt && !latest.inAt;
  const older = cycles.slice(0, -1);

  return (
    <div className="space-y-1">
      {/* Latest cycle (or empty) */}
      {!latest ? (
        <button
          type="button"
          onClick={onNewOut}
          disabled={busy}
          className="w-full min-h-tap rounded-md border bg-background hover:bg-accent px-2 py-2 text-xs inline-flex items-center justify-center gap-1.5"
          title="Sign out"
        >
          <Circle className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Sign out</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => hasOpen && onMarkIn(latest.id, latest.identifier, latest.outAt)}
          onContextMenu={(e) => { e.preventDefault(); onReset(latest.id); }}
          disabled={busy || !!latest.inAt}
          className={cn(
            "w-full min-h-tap rounded-md border px-2 py-2 text-xs transition-colors inline-flex items-center justify-center gap-1.5",
            latest.inAt && "bg-ok/15 border-ok/50 text-ok",
            hasOpen && "bg-primary/10 border-primary/60 text-primary font-semibold",
          )}
          title={hasOpen ? "Tap to mark IN · right-click to undo" : "Returned · right-click to undo"}
        >
          {latest.inAt
            ? <CircleCheck className="h-4 w-4" />
            : <CircleDot className="h-4 w-4" />}
          <span>
            {latest.inAt
              ? `IN ${timeOf(latest.inAt)}`
              : `OUT ${timeOf(latest.outAt)}`}
            {latest.identifier && <span className="ml-1 opacity-70">{latest.identifier}</span>}
          </span>
        </button>
      )}

      {/* If the latest is closed (IN), offer a new OUT button below */}
      {latest && latest.inAt && (
        <button
          type="button"
          onClick={onNewOut}
          disabled={busy}
          className="w-full min-h-tap rounded-md border border-dashed bg-background hover:bg-accent px-2 py-1 text-xs inline-flex items-center justify-center gap-1.5 text-muted-foreground"
        >
          <Plus className="h-3 w-3" /> New OUT
        </button>
      )}

      {/* History disclosure for older cycles */}
      {older.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
          >
            <History className="h-3 w-3" />
            {expanded ? "Hide" : "Show"} {older.length} earlier {older.length === 1 ? "cycle" : "cycles"}
            <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          </button>
          {expanded && (
            <div className="space-y-1 pt-1 border-t">
              {older.map((c) => (
                <div
                  key={c.id}
                  className="rounded-md border bg-muted/30 px-2 py-1 text-[10px] flex items-center justify-between"
                >
                  <span>
                    {c.shift && <span className="font-medium">{c.shift}: </span>}
                    OUT {timeOf(c.outAt)}
                    {c.inAt && ` → IN ${timeOf(c.inAt)}`}
                    {c.identifier && ` · ${c.identifier}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onReset(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete this cycle"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeShift && !cycles.some((c) => c.shift === activeShift) && cycles.length > 0 && !hasOpen && (
        <div className="text-[10px] text-muted-foreground italic">
          No cycle on {activeShift}
        </div>
      )}
    </div>
  );
}

function timeOf(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Compact multi-select for the shifts a person is working at this event.
function ShiftPicker({
  allShifts,
  selected,
  onChange,
}: {
  allShifts: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (allShifts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {allShifts.map((name) => {
        const active = selected.includes(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => {
              const next = active ? selected.filter((s) => s !== name) : [...selected, name];
              onChange(next);
            }}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
              active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground",
            )}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
