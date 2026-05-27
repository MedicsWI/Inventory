"use client";

// Kiosk mode — simplified, sidebar-less UI for shared-device gear sign-out
// at events. A manager opens this on a tablet, hands it to volunteers. Each
// volunteer taps their name, signs gear out or in, then taps "Switch person".
//
// Auth: the device is logged in as a manager; the volunteer only interacts
// with the simplified UI. The "Exit kiosk" link in the corner is small and
// only meant for the manager who started the session.

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, LogOut, ArrowLeft, CircleCheck, Circle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { EventGearDialog, type GearDialogSubmit } from "@/components/event-gear-dialog";
import { cn } from "@/lib/utils";

type Cycle = {
  id: string;
  category: string;
  shift: string | null;
  identifier: string | null;
  outAt: string | null;
  inAt: string | null;
};
type SignOut = {
  id: string;
  personName: string;
  shifts: string[];
  items: Cycle[];
};
type EventDetail = {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "CLOSED" | "CANCELED";
  location: string | null;
  gearCategories: string[];
  signOuts: SignOut[];
};

export default function KioskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.get<EventDetail>(`/api/events/${id}`),
    refetchInterval: 5_000, // keep state fresh in case the manager edits on another device
  });

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [gearDialog, setGearDialog] = useState<
    | { mode: "out"; category: string; soId: string }
    | { mode: "in"; category: string; soId: string; itemId: string; identifier: string | null }
    | null
  >(null);

  const newCycle = useMutation({
    mutationFn: (vars: { soId: string; category: string; identifier?: string | null; initials?: string | null; photoUrl?: string | null }) =>
      api.post(`/api/events/${id}/sign-outs/${vars.soId}/items`, {
        category: vars.category,
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

  const selectedPerson = useMemo(
    () => data?.signOuts.find((s) => s.id === selectedPersonId) ?? null,
    [data, selectedPersonId],
  );

  function handleGearSubmit(vals: GearDialogSubmit) {
    if (!gearDialog) return;
    if (gearDialog.mode === "out") {
      newCycle.mutate(
        {
          soId: gearDialog.soId,
          category: gearDialog.category,
          identifier: vals.identifier ?? null,
          initials: vals.initials ?? null,
          photoUrl: vals.photoUrl ?? null,
        },
        { onSuccess: () => setGearDialog(null) },
      );
    } else {
      markIn.mutate(
        {
          soId: gearDialog.soId,
          itemId: gearDialog.itemId,
          initials: vals.initials ?? null,
          photoUrl: vals.photoUrl ?? null,
        },
        { onSuccess: () => setGearDialog(null) },
      );
    }
  }

  if (isLoading) return <KioskFrame eventId={id}><div className="text-center text-muted-foreground py-20">Loading…</div></KioskFrame>;
  if (!data) return <KioskFrame eventId={id}><div className="text-center py-20">Event not found.</div></KioskFrame>;

  // Person picker
  if (!selectedPerson) {
    return (
      <KioskFrame eventId={id} title={data.name} subtitle={data.location ?? undefined}>
        <div className="space-y-4">
          <h2 className="text-xl text-center text-muted-foreground">Tap your name</h2>
          {data.signOuts.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              No one is signed up for this event yet. Ask a manager to add you.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {data.signOuts
                .slice()
                .sort((a, b) => a.personName.localeCompare(b.personName))
                .map((s) => {
                  const openCycles = s.items.filter((c) => c.outAt && !c.inAt).length;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedPersonId(s.id)}
                      className="h-24 rounded-xl border-2 bg-card hover:bg-accent hover:border-primary transition-colors text-lg font-semibold p-3 text-left relative"
                    >
                      <div>{s.personName}</div>
                      {openCycles > 0 && (
                        <div className="absolute top-2 right-2 text-xs bg-warn/20 text-warn-foreground rounded-full px-2 py-0.5">
                          {openCycles} out
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </KioskFrame>
    );
  }

  // Person's gear view — one row per category
  const cyclesByCategory = new Map<string, Cycle[]>();
  for (const cat of data.gearCategories) cyclesByCategory.set(cat, []);
  for (const c of selectedPerson.items) {
    const arr = cyclesByCategory.get(c.category) ?? [];
    arr.push(c);
    cyclesByCategory.set(c.category, arr);
  }

  return (
    <KioskFrame eventId={id} title={selectedPerson.personName} subtitle={data.name}>
      <div className="space-y-3">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setSelectedPersonId(null)}
          className="w-full sm:w-auto"
        >
          <ArrowLeft className="h-4 w-4" /> Switch person
        </Button>

        <div className="space-y-3">
          {data.gearCategories.map((cat) => {
            const cycles = cyclesByCategory.get(cat) ?? [];
            const openCycle = cycles.find((c) => c.outAt && !c.inAt) ?? null;
            const completed = cycles.filter((c) => c.inAt).length;

            return (
              <div
                key={cat}
                className={cn(
                  "rounded-xl border-2 p-4",
                  openCycle ? "border-warn bg-warn/5" : "border-border bg-card",
                )}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xl font-bold">{cat}</div>
                    {openCycle ? (
                      <div className="text-sm text-warn-foreground">
                        Currently OUT
                        {openCycle.identifier && <span className="font-mono ml-2">[{openCycle.identifier}]</span>}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {completed > 0 ? `${completed} cycle${completed === 1 ? "" : "s"} returned` : "Not signed out"}
                      </div>
                    )}
                  </div>
                  {openCycle ? <CircleCheck className="h-8 w-8 text-warn shrink-0" /> : <Circle className="h-8 w-8 text-muted-foreground shrink-0" />}
                </div>

                {openCycle ? (
                  <Button
                    size="lg"
                    className="w-full h-14 text-lg"
                    onClick={() => setGearDialog({
                      mode: "in",
                      category: cat,
                      soId: selectedPerson.id,
                      itemId: openCycle.id,
                      identifier: openCycle.identifier,
                    })}
                  >
                    Sign IN
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-14 text-lg"
                    onClick={() => setGearDialog({
                      mode: "out",
                      category: cat,
                      soId: selectedPerson.id,
                    })}
                  >
                    Sign OUT
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {gearDialog && (
        <EventGearDialog
          open={true}
          mode={gearDialog.mode}
          category={gearDialog.category}
          personName={selectedPerson.personName}
          context={gearDialog.mode === "in" ? { identifier: gearDialog.identifier } : undefined}
          busy={newCycle.isPending || markIn.isPending}
          onClose={() => setGearDialog(null)}
          onSubmit={handleGearSubmit}
        />
      )}
    </KioskFrame>
  );
}

function KioskFrame({
  eventId,
  title,
  subtitle,
  children,
}: {
  eventId: string;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 max-w-4xl mx-auto">
      <header className="flex items-start justify-between gap-3 mb-6">
        <div>
          {title && <h1 className="text-3xl font-bold">{title}</h1>}
          {subtitle && <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>}
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/events/${eventId}`}>
            <LogOut className="h-4 w-4" /> Exit kiosk
          </Link>
        </Button>
      </header>
      {children}
    </main>
  );
}
