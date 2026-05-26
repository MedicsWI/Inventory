"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { LocationTree, type LocationNode } from "@/components/location-tree";

export default function LocationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["locations-tree"],
    queryFn: () => api.get<LocationNode[]>("/api/locations?tree=1"),
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Locations</h1>
          <p className="text-sm text-muted-foreground">Stations, vehicles, boxes, kits — nested.</p>
        </div>
        <Button asChild>
          <Link href="/locations/new"><Plus className="h-4 w-4" /> New location</Link>
        </Button>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {data && data.length === 0 && (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          No locations yet. Create your first station.
        </div>
      )}
      {data && data.length > 0 && <LocationTree nodes={data} />}
    </div>
  );
}
