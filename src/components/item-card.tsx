"use client";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Boxes, MapPin, AlertTriangle, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpirationBadge } from "@/components/expiration-badge";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type ItemCardData = {
  id: string;
  name: string;
  quantity: number;
  unit?: string | null;
  lowStockThreshold?: number | null;
  expirationDate?: string | Date | null;
  location?: { id: string; name: string } | null;
  category?: { id: string; name: string; color?: string | null } | null;
};

export function ItemCard({
  item,
  compact = false,
  inlineQty = false,
}: {
  item: ItemCardData;
  compact?: boolean;
  inlineQty?: boolean;
}) {
  const qc = useQueryClient();
  const lowStock =
    item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold;

  const adjust = useMutation({
    mutationFn: (delta: number) =>
      api.patch(`/api/items/${item.id}`, {
        quantity: Math.max(0, item.quantity + delta),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["item", item.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const cardBody = (
    <CardContent className={cn("p-4 flex items-center gap-4", compact && "p-3")}>
      <div className="h-12 w-12 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center">
        <Boxes className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate font-semibold">{item.name}</div>
          {item.category && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {item.category.name}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Qty: <span className="font-medium text-foreground">{item.quantity}</span>
            {item.unit ? ` ${item.unit}` : ""}
          </span>
          {item.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {item.location.name}
            </span>
          )}
          <ExpirationBadge date={item.expirationDate ?? null} />
          {lowStock && (
            <Badge variant="danger" className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Low stock
            </Badge>
          )}
        </div>
      </div>
      {inlineQty && (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.preventDefault()}>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-10 w-10"
            disabled={adjust.isPending || item.quantity === 0}
            aria-label="Decrease quantity"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); adjust.mutate(-1); }}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <div className="min-w-[2.5ch] text-center font-bold tabular-nums">{item.quantity}</div>
          <Button
            type="button"
            size="icon"
            className="h-10 w-10"
            disabled={adjust.isPending}
            aria-label="Increase quantity"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); adjust.mutate(+1); }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </CardContent>
  );

  return (
    <Link href={`/items/${item.id}`} aria-label={`Open ${item.name}`}>
      <Card className="transition-all active:scale-[0.98] hover:border-primary/50">
        {cardBody}
      </Card>
    </Link>
  );
}
