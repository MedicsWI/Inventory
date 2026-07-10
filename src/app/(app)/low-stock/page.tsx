"use client";

// Low-stock report with INLINE threshold editing — tuning 75 alert levels
// through the item edit form one at a time is not realistic.
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Check, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ItemCard, type ItemCardData } from "@/components/item-card";
import { ListSkeleton } from "@/components/ui/skeleton";

type Row = ItemCardData & { lowStockThreshold?: number | null; unit?: string | null };

export default function LowStockPage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canTune = can(session?.user.role, "item:update");
  const [tuning, setTuning] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["low-stock"],
    queryFn: () => api.get<Row[]>(`/api/items?lowStock=1`),
  });

  const save = useMutation({
    mutationFn: ({ id, threshold }: { id: string; threshold: number | null }) =>
      api.patch(`/api/items/${id}`, { lowStockThreshold: threshold }),
    onSuccess: (_r, vars) => {
      toast.success(vars.threshold === null ? "Alerts disabled for item" : `Threshold set to ${vars.threshold}`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[vars.id];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  function saveRow(row: Row) {
    const raw = (drafts[row.id] ?? "").trim();
    if (raw === "") return;
    const n = Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(n)) return toast.error("Enter a number");
    // 0 = stop alerting for this item entirely (threshold cleared)
    save.mutate({ id: row.id, threshold: n === 0 ? null : n });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Low stock</h1>
          <p className="text-sm text-muted-foreground">Items at or below their low-stock threshold.</p>
        </div>
        {canTune && (
          <Button variant={tuning ? "default" : "outline"} onClick={() => setTuning((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" /> {tuning ? "Done tuning" : "Tune thresholds"}
          </Button>
        )}
      </header>

      {tuning && (
        <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 p-3">
          Set the quantity at which each item should start alerting. Enter <strong>0</strong> to stop
          alerts for an item entirely. Changes apply to the next daily digest.
        </p>
      )}

      <div className="space-y-2">
        {isLoading && <ListSkeleton rows={4} />}
        {data?.length === 0 && !isLoading && (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Nothing low on stock. ✅
          </div>
        )}
        {!tuning && data?.map((it) => <ItemCard key={it.id} item={it} />)}
        {tuning &&
          data?.map((it) => {
            const draft = drafts[it.id] ?? String(it.lowStockThreshold ?? "");
            const dirty = draft !== String(it.lowStockThreshold ?? "");
            const pending = save.isPending && save.variables?.id === it.id;
            return (
              <div key={it.id} className="rounded-xl border bg-card p-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/items/${it.id}`} className="font-medium hover:underline">
                    {it.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    On hand:{" "}
                    <span className={it.quantity === 0 ? "text-destructive font-semibold" : "font-semibold"}>
                      {it.quantity} {it.unit ?? ""}
                    </span>
                  </div>
                </div>
                <Badge variant="warn">alerts at ≤ {it.lowStockThreshold ?? "—"}</Badge>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    className="h-9 w-24"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                  />
                  <Button size="sm" disabled={!dirty || pending} onClick={() => saveRow(it)}>
                    <Check className="h-4 w-4" /> Save
                  </Button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
