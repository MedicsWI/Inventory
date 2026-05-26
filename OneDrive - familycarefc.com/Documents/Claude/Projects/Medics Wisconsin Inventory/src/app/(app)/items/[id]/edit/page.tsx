"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ItemForm, type ItemFormValue } from "@/components/item-form";

type Loaded = {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  quantity: number;
  unit?: string | null;
  lotNumber?: string | null;
  expirationDate?: string | null;
  lowStockThreshold?: number | null;
  locationId?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  returnable?: boolean;
  tags?: { id: string; name: string }[];
};

export default function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useQuery({
    queryKey: ["item", id],
    queryFn: () => api.get<Loaded>(`/api/items/${id}`),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  const initial: ItemFormValue = {
    id: data.id,
    name: data.name,
    description: data.description ?? "",
    barcode: data.barcode ?? "",
    sku: data.sku ?? "",
    quantity: data.quantity,
    unit: data.unit ?? "each",
    lotNumber: data.lotNumber ?? "",
    expirationDate: data.expirationDate ? data.expirationDate.slice(0, 10) : "",
    lowStockThreshold: data.lowStockThreshold ?? "",
    locationId: data.locationId ?? "",
    categoryId: data.categoryId ?? "",
    notes: data.notes ?? "",
    photoUrl: data.photoUrl ?? null,
    returnable: data.returnable ?? false,
    tagIds: (data.tags ?? []).map((t) => t.id),
  };

  return <ItemForm mode="edit" initial={initial} />;
}
