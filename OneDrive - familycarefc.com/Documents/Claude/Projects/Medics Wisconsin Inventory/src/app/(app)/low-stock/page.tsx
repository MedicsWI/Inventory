"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ItemCard, type ItemCardData } from "@/components/item-card";
import { ListSkeleton } from "@/components/ui/skeleton";

export default function LowStockPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["low-stock"],
    queryFn: () => api.get<ItemCardData[]>(`/api/items?lowStock=1`),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Low stock</h1>
        <p className="text-sm text-muted-foreground">Items at or below their low-stock threshold.</p>
      </header>

      <div className="space-y-2">
        {isLoading && <ListSkeleton rows={4} />}
        {data?.length === 0 && !isLoading && (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Nothing low on stock. ✅
          </div>
        )}
        {data?.map((it) => <ItemCard key={it.id} item={it} />)}
      </div>
    </div>
  );
}
