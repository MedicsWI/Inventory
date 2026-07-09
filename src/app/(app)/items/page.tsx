"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Plus, Search, CheckSquare, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemCard, type ItemCardData } from "@/components/item-card";
import { InlineCreate } from "@/components/quick-create-picker";
import { ListSkeleton } from "@/components/ui/skeleton";

type Lookup = { id: string; name: string }[];

export default function ItemsPage() {
  const [q, setQ] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: session } = useSession();
  const canBulk = session?.user.role === "ADMIN" || session?.user.role === "MANAGER";

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["items", q],
    queryFn: () => api.get<ItemCardData[]>(`/api/items${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });

  const locs = useQuery({
    queryKey: ["locs-flat"],
    queryFn: () => api.get<Lookup>("/api/locations"),
    enabled: selectMode && selected.size > 0,
  });
  const cats = useQuery({
    queryKey: ["cats"],
    queryFn: () => api.get<Lookup>("/api/categories"),
    enabled: selectMode && selected.size > 0,
  });
  const tags = useQuery({
    queryKey: ["tags"],
    queryFn: () => api.get<Lookup>("/api/tags"),
    enabled: selectMode && selected.size > 0,
  });

  const bulkPatch = useMutation({
    mutationFn: (patch: {
      locationId?: string | null;
      categoryId?: string | null;
      addTagIds?: string[];
      removeTagIds?: string[];
    }) => api.patch("/api/items/bulk", { ids: [...selected], patch }),
    onSuccess: (r) => {
      const n = (r as { updated?: number })?.updated ?? selected.size;
      toast.success(`Updated ${n} item${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setSelected(new Set());
      setSelectMode(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === data?.length) setSelected(new Set());
    else setSelected(new Set((data ?? []).map((i) => i.id)));
  }

  const selectedNames = useMemo(
    () => (data ?? []).filter((i) => selected.has(i.id)).map((i) => i.name),
    [data, selected],
  );

  // Which inline create panel (if any) is open
  const [openCreate, setOpenCreate] = useState<null | "tag" | "category" | "location">(null);

  return (
    <div className="space-y-4 pb-40 md:pb-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Items</h1>
          <p className="text-sm text-muted-foreground">All supplies across Medics WI.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canBulk && (
            <Button
              variant={selectMode ? "default" : "outline"}
              onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); setOpenCreate(null); }}
            >
              <CheckSquare className="h-4 w-4" /> {selectMode ? "Done selecting" : "Bulk edit"}
            </Button>
          )}
          {can(session?.user.role, "item:create") && (
            <Button asChild>
              <Link href="/items/new"><Plus className="h-4 w-4" /> Add item</Link>
            </Button>
          )}
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, SKU, or barcode…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      {selectMode && (
        <div className="flex items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {selected.size === data?.length ? "Deselect all" : "Select all"}
          </Button>
          <span className="text-muted-foreground">{selected.size} selected</span>
        </div>
      )}

      <div className="space-y-2">
        {isLoading && <ListSkeleton rows={6} />}
        {data?.length === 0 && !isLoading && (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {q ? `No items match "${q}".` : "No items yet — tap Add item to create your first one."}
          </div>
        )}
        {data?.map((it) => (
          <div key={it.id} className="flex items-stretch gap-2">
            {selectMode && (
              <label className="flex items-center px-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={selected.has(it.id)}
                  onChange={() => toggle(it.id)}
                />
              </label>
            )}
            <div className="flex-1">
              <ItemCard item={it} inlineQty={!selectMode} />
            </div>
          </div>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-16 md:bottom-4 z-40 mx-auto w-full max-w-2xl px-4"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="rounded-xl border bg-card shadow-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold">{selected.size}</span>{" "}
                <span className="text-muted-foreground">item{selected.size === 1 ? "" : "s"} selected</span>
                {selectedNames.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground truncate inline-block max-w-xs align-middle">
                    {selectedNames.slice(0, 3).join(", ")}{selectedNames.length > 3 ? "…" : ""}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelected(new Set()); setSelectMode(false); setOpenCreate(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Location row */}
            <div className="flex gap-2 items-center flex-wrap">
              <select
                className="h-10 flex-1 rounded-md border bg-background px-2 text-sm"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  bulkPatch.mutate({ locationId: v === "__none__" ? null : v });
                  e.target.value = "";
                }}
                disabled={bulkPatch.isPending}
              >
                <option value="">Move to location…</option>
                <option value="__none__">— Unassign location —</option>
                {locs.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <Button
                type="button"
                size="sm"
                variant={openCreate === "location" ? "default" : "outline"}
                onClick={() => setOpenCreate(openCreate === "location" ? null : "location")}
              >
                <Plus className="h-4 w-4" /> New
              </Button>
            </div>
            {openCreate === "location" && (
              <InlineCreate
                kind="location"
                placeholder="New location name"
                onCreated={(created) => {
                  bulkPatch.mutate({ locationId: created.id });
                  setOpenCreate(null);
                }}
              />
            )}

            {/* Category row */}
            <div className="flex gap-2 items-center flex-wrap">
              <select
                className="h-10 flex-1 rounded-md border bg-background px-2 text-sm"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  bulkPatch.mutate({ categoryId: v === "__none__" ? null : v });
                  e.target.value = "";
                }}
                disabled={bulkPatch.isPending}
              >
                <option value="">Set category…</option>
                <option value="__none__">— Clear category —</option>
                {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button
                type="button"
                size="sm"
                variant={openCreate === "category" ? "default" : "outline"}
                onClick={() => setOpenCreate(openCreate === "category" ? null : "category")}
              >
                <Plus className="h-4 w-4" /> New
              </Button>
            </div>
            {openCreate === "category" && (
              <InlineCreate
                kind="category"
                placeholder="New category name"
                onCreated={(created) => {
                  bulkPatch.mutate({ categoryId: created.id });
                  setOpenCreate(null);
                }}
              />
            )}

            {/* Tags row */}
            <div className="flex gap-2 items-center flex-wrap">
              <select
                className="h-10 flex-1 rounded-md border bg-background px-2 text-sm"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  bulkPatch.mutate({ addTagIds: [v] });
                  e.target.value = "";
                }}
                disabled={bulkPatch.isPending}
              >
                <option value="">Add tag…</option>
                {tags.data?.map((t) => <option key={t.id} value={t.id}>+ {t.name}</option>)}
              </select>
              <select
                className="h-10 flex-1 rounded-md border bg-background px-2 text-sm"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  bulkPatch.mutate({ removeTagIds: [v] });
                  e.target.value = "";
                }}
                disabled={bulkPatch.isPending}
              >
                <option value="">Remove tag…</option>
                {tags.data?.map((t) => <option key={t.id} value={t.id}>– {t.name}</option>)}
              </select>
              <Button
                type="button"
                size="sm"
                variant={openCreate === "tag" ? "default" : "outline"}
                onClick={() => setOpenCreate(openCreate === "tag" ? null : "tag")}
              >
                <Plus className="h-4 w-4" /> New
              </Button>
            </div>
            {openCreate === "tag" && (
              <InlineCreate
                kind="tag"
                placeholder="New tag (e.g. ALS, controlled, perishable)"
                onCreated={(created) => {
                  bulkPatch.mutate({ addTagIds: [created.id] });
                  setOpenCreate(null);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
