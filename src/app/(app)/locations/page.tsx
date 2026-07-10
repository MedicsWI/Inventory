"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Plus, ListChecks, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LocationTree, type LocationNode } from "@/components/location-tree";

type LocType = "STATION" | "VEHICLE" | "BOX" | "KIT" | "BAG" | "SHELF";
const TYPES: LocType[] = ["STATION", "VEHICLE", "BOX", "KIT", "BAG", "SHELF"];

type FlatLocation = { id: string; name: string; type: LocType };

export default function LocationsPage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canBulk = can(session?.user.role, "location:update");

  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<"" | LocType>("");

  const { data, isLoading } = useQuery({
    queryKey: ["locations-tree"],
    queryFn: () => api.get<LocationNode[]>("/api/locations?tree=1"),
  });

  const flat = useQuery({
    queryKey: ["locs-flat"],
    queryFn: () => api.get<FlatLocation[]>("/api/locations"),
    enabled: bulkMode,
  });

  const rows = useMemo(() => {
    const all = flat.data ?? [];
    return typeFilter ? all.filter((l) => l.type === typeFilter) : all;
  }, [flat.data, typeFilter]);

  const bulkType = useMutation({
    mutationFn: (type: LocType) =>
      api.patch<{ updated: number }>("/api/locations/bulk", { ids: [...selected], type }),
    onSuccess: (r, type) => {
      toast.success(`${r.updated} location(s) changed to ${type}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["locations-tree"] });
      qc.invalidateQueries({ queryKey: ["locs-flat"] });
      qc.invalidateQueries({ queryKey: ["location"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllShown() {
    setSelected(new Set(rows.map((r) => r.id)));
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Locations</h1>
          <p className="text-sm text-muted-foreground">Stations, vehicles, boxes, kits, bags — nested.</p>
        </div>
        <div className="flex gap-2">
          {canBulk && (
            <Button
              variant={bulkMode ? "default" : "outline"}
              onClick={() => { setBulkMode((v) => !v); setSelected(new Set()); }}
            >
              {bulkMode ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              {bulkMode ? "Done" : "Bulk edit"}
            </Button>
          )}
          <Button asChild>
            <Link href="/locations/new"><Plus className="h-4 w-4" /> New location</Link>
          </Button>
        </div>
      </header>

      {bulkMode ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "" | LocType)}
            >
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={selectAllShown} disabled={rows.length === 0}>
              Select all shown ({rows.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
              Clear
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant={selected.size ? "default" : "outline"}>{selected.size} selected</Badge>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value=""
                disabled={selected.size === 0 || bulkType.isPending}
                onChange={(e) => {
                  const t = e.target.value as LocType | "";
                  if (t) bulkType.mutate(t);
                  e.target.value = "";
                }}
              >
                <option value="">Change type to…</option>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            {flat.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
            {rows.map((l) => (
              <label
                key={l.id}
                className="flex items-center gap-3 border-b p-2.5 last:border-b-0 hover:bg-accent/40 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.has(l.id)}
                  onChange={() => toggle(l.id)}
                />
                <span className="flex-1 min-w-0 truncate font-medium">{l.name}</span>
                <Badge variant="outline">{l.type}</Badge>
              </label>
            ))}
            {!flat.isLoading && rows.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No locations match.</div>
            )}
          </div>
        </div>
      ) : (
        <>
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {data && data.length === 0 && (
            <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              No locations yet. Create your first station.
            </div>
          )}
          {data && data.length > 0 && <LocationTree nodes={data} />}
        </>
      )}
    </div>
  );
}
