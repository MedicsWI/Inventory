"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Plus, ClipboardCheck, Play } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineCreate } from "@/components/quick-create-picker";
import { formatDate } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  status: "DRAFT" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CANCELED";
  createdAt: string;
  completedAt: string | null;
  location: { id: string; name: string } | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  _count: { lines: number };
  discrepancyCount: number;
  unitsOff: number;
};

type Lookup = { id: string; name: string }[];

const statusColors: Record<Row["status"], "secondary" | "warn" | "danger" | "ok" | "outline"> = {
  DRAFT: "outline",
  IN_PROGRESS: "warn",
  REVIEW: "secondary",
  COMPLETED: "ok",
  CANCELED: "outline",
};

export default function StockCountsPage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN" || session?.user.role === "MANAGER";

  const rows = useQuery({
    queryKey: ["stock-counts"],
    queryFn: () => api.get<Row[]>("/api/stock-counts"),
  });

  // Create form (admin/manager only)
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", locationId: "", assignedToId: "" });
  const [showNewLoc, setShowNewLoc] = useState(false);
  const locs = useQuery({ queryKey: ["locs-flat"], queryFn: () => api.get<Lookup>("/api/locations"), enabled: creating });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ id: string; name: string | null; email: string }[]>("/api/users"),
    enabled: creating && isAdmin,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/api/stock-counts", {
        name: draft.name,
        locationId: draft.locationId || null,
        assignedToId: draft.assignedToId || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      toast.success("Created. Open it to lock in the count.");
      setDraft({ name: "", locationId: "", assignedToId: "" });
      setCreating(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" /> Stock counts
          </h1>
          <p className="text-sm text-muted-foreground">
            Physical inventory verification. Assign a count, record actuals, manager approves.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" /> New count
          </Button>
        )}
      </header>

      {creating && (
        <Card>
          <CardHeader><CardTitle>New stock count</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Name *</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Q1 — Medic 12 full count" />
            </div>
            <div className="space-y-1">
              <Label>Location (optional — narrows scope)</Label>
              <div className="flex gap-2">
                <select className="h-12 flex-1 rounded-md border bg-background px-3"
                  value={draft.locationId}
                  onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}>
                  <option value="">All locations</option>
                  {locs.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <Button type="button" size="icon" variant={showNewLoc ? "default" : "outline"}
                  onClick={() => setShowNewLoc((v) => !v)} aria-label="New location">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {showNewLoc && (
                <InlineCreate
                  kind="location"
                  placeholder="New location name"
                  className="mt-2"
                  onCreated={(created) => {
                    setDraft({ ...draft, locationId: created.id });
                    setShowNewLoc(false);
                  }}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label>Assigned to (optional)</Label>
              <select className="h-12 w-full rounded-md border bg-background px-3"
                value={draft.assignedToId}
                onChange={(e) => setDraft({ ...draft, assignedToId: e.target.value })}>
                <option value="">— pick a person —</option>
                {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={!draft.name || create.isPending}>Create draft</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>All counts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {rows.data?.length === 0 && !rows.isLoading && (
            <div className="text-sm text-muted-foreground">No stock counts yet.</div>
          )}
          {rows.data?.map((c) => (
            <Link
              key={c.id}
              href={`/stock-counts/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{c.name}</span>
                  <Badge variant={statusColors[c.status]}>{c.status.replace("_", " ")}</Badge>
                  {c.status === "DRAFT" && <Badge variant="outline"><Play className="h-3 w-3 mr-1" />ready to start</Badge>}
                  {c.discrepancyCount > 0 && (c.status === "IN_PROGRESS" || c.status === "REVIEW") && (
                    <Badge variant="warn">
                      {c.discrepancyCount} off · {c.unitsOff} units
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {c.location ? `Scope: ${c.location.name}` : "Scope: all locations"}
                  {c.assignedTo && ` · Assigned: ${c.assignedTo.name ?? c.assignedTo.email}`}
                  {c._count.lines > 0 && ` · ${c._count.lines} lines`}
                  {` · created ${formatDate(c.createdAt)}`}
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
