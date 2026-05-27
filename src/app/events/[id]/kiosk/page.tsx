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
import { ChevronLeft, LogOut, ArrowLeft, CircleCheck, Circle, UserPlus, X, Search, Shield, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventGearDialog, type GearDialogSubmit } from "@/components/event-gear-dialog";
import { cn } from "@/lib/utils";

type VolunteerMatch = {
  id: string;
  type: "MEDICAL" | "SECURITY";
  firstName: string;
  lastName: string;
  email: string;
};

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
  const [addingPerson, setAddingPerson] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  // "Quick new" form — almost always a security walk-in
  const [quickNewOpen, setQuickNewOpen] = useState(false);
  const [quickNew, setQuickNew] = useState<{
    type: "MEDICAL" | "SECURITY";
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }>({ type: "SECURITY", firstName: "", lastName: "", email: "", phone: "" });
  const [gearDialog, setGearDialog] = useState<
    | { mode: "out"; category: string; soId: string }
    | { mode: "in"; category: string; soId: string; itemId: string; identifier: string | null }
    | null
  >(null);

  // Live volunteer search — fires when the operator opens the add panel and types.
  const { data: matches } = useQuery({
    queryKey: ["volunteer-search", searchQ],
    queryFn: () => api.get<VolunteerMatch[]>(`/api/volunteers?q=${encodeURIComponent(searchQ)}`),
    enabled: addingPerson && searchQ.trim().length >= 2,
  });

  // Names already on this event — used to grey out duplicates in search results.
  const existingVolunteerIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of data?.signOuts ?? []) {
      // EventSignOut.volunteerId isn't on the kiosk SignOut type, but we can match
      // by name as a soft check. Server still enforces nothing.
      set.add(`${s.personName.toLowerCase()}`);
    }
    return set;
  }, [data]);

  // Add a sign-out by linking to a Volunteer record (preferred path)
  const addFromVolunteer = useMutation({
    mutationFn: (vId: string) =>
      api.post<{ id: string }>(`/api/events/${id}/sign-outs`, {
        volunteerId: vId,
        role: "VOLUNTEER",
        shifts: [],
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["event", id] });
      setSearchQ("");
      setAddingPerson(false);
      setSelectedPersonId(r.id);
    },
    onError: (e) => toast.error(String(e)),
  });

  // Walk-in path: create a Volunteer record, then add the sign-out linked to it.
  const quickNewMut = useMutation({
    mutationFn: async () => {
      const v = await api.post<{ id: string; firstName: string; lastName: string }>(
        "/api/volunteers",
        {
          type: quickNew.type,
          firstName: quickNew.firstName.trim(),
          lastName: quickNew.lastName.trim(),
          email: quickNew.email.trim().toLowerCase(),
          phone: quickNew.phone.trim() || null,
        },
      );
      const so = await api.post<{ id: string }>(`/api/events/${id}/sign-outs`, {
        volunteerId: v.id,
        role: "VOLUNTEER",
        shifts: [],
      });
      return so;
    },
    onSuccess: (r) => {
      toast.success("Volunteer created and signed in");
      qc.invalidateQueries({ queryKey: ["event", id] });
      setQuickNewOpen(false);
      setQuickNew({ type: "SECURITY", firstName: "", lastName: "", email: "", phone: "" });
      setAddingPerson(false);
      setSearchQ("");
      setSelectedPersonId(r.id);
    },
    onError: (e) => toast.error(String(e)),
  });

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

            {/* Add-person tile — opens an inline form */}
            {!addingPerson && (
              <button
                onClick={() => setAddingPerson(true)}
                className="h-24 rounded-xl border-2 border-dashed bg-card hover:bg-accent hover:border-primary transition-colors text-base font-medium p-3 grid place-items-center text-muted-foreground"
              >
                <div className="flex flex-col items-center gap-1">
                  <UserPlus className="h-5 w-5" />
                  <span>Add person</span>
                </div>
              </button>
            )}
          </div>

          {addingPerson && !quickNewOpen && (
            <div className="rounded-xl border-2 border-primary bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Find a volunteer</div>
                <Button variant="ghost" size="icon" onClick={() => { setAddingPerson(false); setSearchQ(""); }} aria-label="Cancel">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Type a name or email…"
                  autoFocus
                  className="h-12 text-lg pl-9"
                />
              </div>

              {searchQ.trim().length < 2 ? (
                <div className="text-sm text-muted-foreground text-center py-3">
                  Type at least 2 letters to search the volunteer roster.
                </div>
              ) : !matches || matches.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-3">
                  No match. Use <strong>New security walk-in</strong> below to add them.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                  {matches.map((v) => {
                    const already = existingVolunteerIds.has(`${v.firstName} ${v.lastName}`.toLowerCase());
                    return (
                      <button
                        key={v.id}
                        disabled={already || addFromVolunteer.isPending}
                        onClick={() => addFromVolunteer.mutate(v.id)}
                        className={cn(
                          "rounded-lg border-2 p-3 text-left transition-colors",
                          already
                            ? "opacity-50 cursor-not-allowed border-border bg-muted"
                            : "border-border bg-card hover:bg-accent hover:border-primary",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {v.type === "SECURITY" ? (
                            <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <Stethoscope className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold truncate">
                              {v.lastName}, {v.firstName}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{v.email}</div>
                          </div>
                        </div>
                        {already && (
                          <div className="text-xs text-muted-foreground mt-1">Already signed in</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12"
                  onClick={() => {
                    // Pre-fill split name if the operator already typed something
                    const t = searchQ.trim();
                    let first = "", last = "";
                    if (t.includes(",")) {
                      const [ln, fn] = t.split(",").map((s) => s.trim());
                      first = fn ?? ""; last = ln ?? "";
                    } else if (t.includes(" ")) {
                      const parts = t.split(/\s+/);
                      first = parts[0] ?? "";
                      last = parts.slice(1).join(" ");
                    } else {
                      first = t;
                    }
                    setQuickNew({ type: "SECURITY", firstName: first, lastName: last, email: "", phone: "" });
                    setQuickNewOpen(true);
                  }}
                >
                  <Shield className="h-4 w-4" /> New security walk-in
                </Button>
              </div>
            </div>
          )}

          {addingPerson && quickNewOpen && (
            <div className="rounded-xl border-2 border-primary bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">New walk-in</div>
                <Button variant="ghost" size="icon" onClick={() => setQuickNewOpen(false)} aria-label="Back">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={quickNew.type === "SECURITY" ? "default" : "outline"}
                  onClick={() => setQuickNew({ ...quickNew, type: "SECURITY" })}
                >
                  <Shield className="h-4 w-4" /> Security
                </Button>
                <Button
                  type="button"
                  variant={quickNew.type === "MEDICAL" ? "default" : "outline"}
                  onClick={() => setQuickNew({ ...quickNew, type: "MEDICAL" })}
                >
                  <Stethoscope className="h-4 w-4" /> Medical
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="First name"
                  value={quickNew.firstName}
                  onChange={(e) => setQuickNew({ ...quickNew, firstName: e.target.value })}
                  className="h-12 text-lg"
                />
                <Input
                  placeholder="Last name"
                  value={quickNew.lastName}
                  onChange={(e) => setQuickNew({ ...quickNew, lastName: e.target.value })}
                  className="h-12 text-lg"
                />
              </div>
              <Input
                placeholder="Email"
                type="email"
                value={quickNew.email}
                onChange={(e) => setQuickNew({ ...quickNew, email: e.target.value })}
                className="h-12 text-lg"
              />
              <Input
                placeholder="Phone (optional)  e.g. +19205551234"
                value={quickNew.phone}
                onChange={(e) => setQuickNew({ ...quickNew, phone: e.target.value })}
                className="h-12 text-lg"
              />

              <Button
                size="lg"
                className="w-full h-12 text-base"
                onClick={() => quickNewMut.mutate()}
                disabled={
                  quickNewMut.isPending ||
                  !quickNew.firstName.trim() ||
                  !quickNew.lastName.trim() ||
                  !quickNew.email.trim()
                }
              >
                <UserPlus className="h-4 w-4" /> {quickNewMut.isPending ? "Saving…" : "Save & start sign-out"}
              </Button>
              <div className="text-xs text-muted-foreground">
                Creates a permanent volunteer record. You can finish DOB, emergency contact,
                and acknowledgments in the volunteer page later — they&apos;ll show on the daily missing-data digest.
              </div>
            </div>
          )}

          {data.signOuts.length === 0 && !addingPerson && (
            <div className="text-center text-muted-foreground text-sm">
              No one signed up yet. Tap <strong>Add person</strong> above to get started.
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
