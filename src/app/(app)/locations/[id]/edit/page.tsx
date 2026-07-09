"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { LocationForm } from "@/components/location-form";

type Loaded = {
  id: string;
  name: string;
  type: "STATION" | "VEHICLE" | "BOX" | "KIT" | "BAG" | "SHELF";
  parentId: string | null;
  barcode: string | null;
  notes: string | null;
  updatedAt?: string;
};

export default function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useQuery({
    queryKey: ["location", id],
    queryFn: () => api.get<Loaded>(`/api/locations/${id}`),
    // Never seed the form from a stale cached copy (same fix as item edit).
    refetchOnMount: "always",
    staleTime: 0,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  return (
    <LocationForm
      key={data.updatedAt ?? data.id}
      mode="edit"
      initial={{
        id: data.id,
        name: data.name,
        type: data.type,
        parentId: data.parentId,
        barcode: data.barcode,
        notes: data.notes,
      }}
    />
  );
}
