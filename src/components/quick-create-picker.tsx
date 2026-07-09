"use client";

// Reusable "select from existing OR create a new one inline" picker.
// Used for tags, categories, and locations anywhere they need to be chosen.
//
// Caller supplies:
//   - kind: "tag" | "category" | "location" — controls the API endpoint and form fields
//   - onPick(id, name): called when the user selects an existing OR creates a new one
//   - currentIds: optional, to highlight which are already selected (for multi-select like tags)
//
// The picker itself is presentation-only. Caller decides whether to render it as a
// single-select (categories, locations) or as a tag-chip group (tags).

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PickKind = "tag" | "category" | "location";
export type LocationType = "STATION" | "VEHICLE" | "BOX" | "KIT" | "BAG" | "SHELF";

type GenericOption = { id: string; name: string };
type LocationOption = GenericOption & { type?: LocationType };

const KIND_ENDPOINTS: Record<PickKind, string> = {
  tag: "/api/tags",
  category: "/api/categories",
  location: "/api/locations",
};

const LOCATION_TYPES: LocationType[] = ["STATION", "VEHICLE", "BOX", "KIT", "BAG", "SHELF"];

export function useQuickCreate(kind: PickKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; type?: LocationType; parentId?: string | null }) => {
      const body: Record<string, unknown> = { name: payload.name };
      if (kind === "location") {
        body.type = payload.type ?? "BOX";
        if (payload.parentId) body.parentId = payload.parentId;
      }
      const created = await api.post<GenericOption>(KIND_ENDPOINTS[kind], body);
      return created;
    },
    onSuccess: () => {
      const key =
        kind === "tag" ? "tags" : kind === "category" ? "cats" : "locs-flat";
      qc.invalidateQueries({ queryKey: [key] });
      qc.invalidateQueries({ queryKey: ["locations-tree"] });
    },
    onError: (e) => toast.error(String(e)),
  });
}

// Compact inline form for creating a new tag / category / location.
// Renders a name input + (for locations) a type picker + Create button.
// Calls onCreated with the new id so the caller can immediately apply it.
export function InlineCreate({
  kind,
  onCreated,
  placeholder,
  className,
}: {
  kind: PickKind;
  onCreated: (created: GenericOption) => void;
  placeholder?: string;
  className?: string;
}) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<LocationType>("BOX");
  const create = useQuickCreate(kind);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, type: kind === "location" ? type : undefined },
      {
        onSuccess: (created) => {
          onCreated(created);
          setName("");
        },
      },
    );
  }

  return (
    <div className={"flex gap-2 items-end " + (className ?? "")}>
      <div className="flex-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder ?? `New ${kind} name`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      {kind === "location" && (
        <select
          className="h-12 rounded-md border bg-background px-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as LocationType)}
        >
          {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
      <Button type="button" variant="outline" onClick={submit} disabled={!name.trim() || create.isPending}>
        {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add
      </Button>
    </div>
  );
}

// Returns the full list of options for a kind, kept in sync via TanStack Query.
export function useOptions(kind: PickKind) {
  const queryKey =
    kind === "tag" ? ["tags"] : kind === "category" ? ["cats"] : ["locs-flat"];
  return useQuery({
    queryKey,
    queryFn: () => api.get<LocationOption[]>(KIND_ENDPOINTS[kind]),
  });
}
