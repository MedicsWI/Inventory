"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ItemCard, type ItemCardData } from "@/components/item-card";
import { ListSkeleton } from "@/components/ui/skeleton";

const presets = [
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

export default function ExpiringPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ["expiring", days],
    queryFn: () => api.get<ItemCardData[]>(`/api/items?expiringWithin=${days}`),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Expiring</h1>
        <p className="text-sm text-muted-foreground">Items expiring within the selected window.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p.days}
            variant={days === p.days ? "default" : "outline"}
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading && <ListSkeleton rows={5} />}
        {data?.length === 0 && !isLoading && (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Nothing expiring in this window. 🎉
          </div>
        )}
        {data?.map((it) => <ItemCard key={it.id} item={it} />)}
      </div>
    </div>
  );
}
