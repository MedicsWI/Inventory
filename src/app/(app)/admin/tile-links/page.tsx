"use client";

// Bulk Tile-tracker linking — every returnable asset (AEDs, monitors, carts,
// bags) with an inline tile_device_id field. Register devices in the ops hub
// Tile Trackers page, then paste each device ID next to its item here.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Search, ArrowLeft, Loader2, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Item = {
  id: string;
  name: string;
  barcode: string | null;
  tileDeviceId: string | null;
  category: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
};

export default function TileLinksPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["items", "returnable"],
    queryFn: () => api.get<Item[]>("/api/items?returnable=1"),
  });

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data;
    if (onlyUnlinked) r = r.filter((i) => !i.tileDeviceId);
    const needle = q.trim().toLowerCase();
    if (needle) {
      r = r.filter(
        (i) =>
          i.name.toLowerCase().includes(needle) ||
          (i.barcode ?? "").toLowerCase().includes(needle) ||
          (i.tileDeviceId ?? "").toLowerCase().includes(needle),
      );
    }
    return [...r].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [data, q, onlyUnlinked]);

  const counts = useMemo(() => {
    const total = data?.length ?? 0;
    const linked = data?.filter((i) => i.tileDeviceId).length ?? 0;
    return { total, linked, unlinked: total - linked };
  }, [data]);

  const saveMut = useMutation({
    mutationFn: ({ id, tileDeviceId }: { id: string; tileDeviceId: string | null }) =>
      api.patch(`/api/items/${id}`, { tileDeviceId }),
    onSuccess: (_r, vars) => {
      toast.success(vars.tileDeviceId ? "Tracker linked" : "Tracker unlinked");
      setDrafts((d) => {
        const next = { ...d };
        delete next[vars.id];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e) => {
      // Unique constraint on tile_device_id → duplicate paste is the likely cause
      const msg = String(e);
      toast.error(msg.includes("Unique") || msg.includes("unique")
        ? "That Tile ID is already linked to another item."
        : msg);
    },
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" /> Tile tracker links
          </h1>
          <p className="text-sm text-muted-foreground">
            Link each returnable asset to its Tile tracker. Register devices in the ops hub{" "}
            <a
              href="https://ops.medicswisconsin.com/admin/tile-devices"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Tile Trackers
            </a>{" "}
            page first, then paste each device ID here. Remember to also set the item link on the
            ops hub side so the live map can click through.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Admin</Link>
        </Button>
      </header>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, barcode, or Tile ID..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              variant={onlyUnlinked ? "default" : "outline"}
              onClick={() => setOnlyUnlinked(!onlyUnlinked)}
            >
              <Unlink className="h-4 w-4" /> Unlinked only
            </Button>
            <Badge variant="ok">{counts.linked} linked</Badge>
            <Badge variant={counts.unlinked ? "warn" : "outline"}>{counts.unlinked} unlinked</Badge>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No returnable assets match. Trackable items must be marked{" "}
              <strong>returnable</strong> on the item form.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr>
                    <th className="text-left p-2">Item</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-left p-2">Barcode</th>
                    <th className="text-left p-2">Tile device ID</th>
                    <th className="text-left p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const draft = drafts[i.id] ?? i.tileDeviceId ?? "";
                    const dirty = draft !== (i.tileDeviceId ?? "");
                    const pending = saveMut.isPending && saveMut.variables?.id === i.id;
                    return (
                      <tr key={i.id} className="border-t align-middle hover:bg-accent/30">
                        <td className="p-2 min-w-[160px]">
                          <Link href={`/items/${i.id}`} className="font-medium hover:underline">
                            {i.name}
                          </Link>
                          {i.tileDeviceId ? (
                            <Badge variant="ok" className="ml-2 inline-flex items-center gap-1 text-[10px]">
                              <Link2 className="h-3 w-3" /> Linked
                            </Badge>
                          ) : null}
                        </td>
                        <td className="p-2 text-xs">{i.category?.name ?? "—"}</td>
                        <td className="p-2 font-mono text-xs">{i.barcode ?? "—"}</td>
                        <td className="p-2">
                          <Input
                            value={draft}
                            onChange={(e) => setDrafts((d) => ({ ...d, [i.id]: e.target.value }))}
                            placeholder="Paste Tile device ID"
                            className="h-9 min-w-[220px] font-mono text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              disabled={!dirty || pending}
                              onClick={() =>
                                saveMut.mutate({ id: i.id, tileDeviceId: draft.trim() || null })
                              }
                            >
                              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                              Save
                            </Button>
                            {i.tileDeviceId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                title="Remove the tracker link"
                                onClick={() => saveMut.mutate({ id: i.id, tileDeviceId: null })}
                              >
                                <Unlink className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
