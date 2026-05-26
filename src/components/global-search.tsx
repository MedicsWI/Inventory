"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Boxes, MapPin, Tag, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/input";

type Hit =
  | { kind: "item"; id: string; name: string; quantity: number; unit: string | null }
  | { kind: "location"; id: string; name: string; type: string }
  | { kind: "category"; id: string; name: string };

export function GlobalSearch() {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click / Esc
  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      // Cmd/Ctrl+K to focus
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = wrapperRef.current?.querySelector("input");
        (input as HTMLInputElement | null)?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["search", q],
    queryFn: () =>
      api.get<{
        items: { id: string; name: string; quantity: number; unit: string | null }[];
        locations: { id: string; name: string; type: string }[];
        categories: { id: string; name: string }[];
      }>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

  const hits: Hit[] = React.useMemo(() => {
    if (!data) return [];
    return [
      ...data.items.map((i) => ({ kind: "item" as const, ...i })),
      ...data.locations.map((l) => ({ kind: "location" as const, ...l })),
      ...data.categories.map((c) => ({ kind: "category" as const, ...c })),
    ];
  }, [data]);

  function navigate(h: Hit) {
    if (h.kind === "item") router.push(`/items/${h.id}`);
    else if (h.kind === "location") router.push(`/locations/${h.id}`);
    else if (h.kind === "category") router.push(`/items?q=${encodeURIComponent(h.name)}`);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={wrapperRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search items, locations… (Ctrl+K)"
          className="pl-9 h-10"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg overflow-hidden">
          {hits.length === 0 && !isFetching && (
            <div className="p-3 text-sm text-muted-foreground">No matches.</div>
          )}
          <ul className="max-h-80 overflow-auto">
            {data?.items.length ? (
              <li>
                <div className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/50">Items</div>
                {data.items.map((i) => (
                  <button
                    key={`item-${i.id}`}
                    type="button"
                    onClick={() => navigate({ kind: "item", ...i })}
                    className="flex w-full items-center gap-2 px-3 py-3 min-h-tap text-sm hover:bg-accent text-left"
                  >
                    <Boxes className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{i.name}</span>
                    <span className="text-xs text-muted-foreground">{i.quantity}{i.unit ? ` ${i.unit}` : ""}</span>
                  </button>
                ))}
              </li>
            ) : null}

            {data?.locations.length ? (
              <li>
                <div className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/50">Locations</div>
                {data.locations.map((l) => (
                  <button
                    key={`loc-${l.id}`}
                    type="button"
                    onClick={() => navigate({ kind: "location", ...l })}
                    className="flex w-full items-center gap-2 px-3 py-3 min-h-tap text-sm hover:bg-accent text-left"
                  >
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="text-xs text-muted-foreground">{l.type}</span>
                  </button>
                ))}
              </li>
            ) : null}

            {data?.categories.length ? (
              <li>
                <div className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/50">Categories</div>
                {data.categories.map((c) => (
                  <button
                    key={`cat-${c.id}`}
                    type="button"
                    onClick={() => navigate({ kind: "category", ...c })}
                    className="flex w-full items-center gap-2 px-3 py-3 min-h-tap text-sm hover:bg-accent text-left"
                  >
                    <Tag className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{c.name}</span>
                  </button>
                ))}
              </li>
            ) : null}
          </ul>
        </div>
      )}
    </div>
  );
}
