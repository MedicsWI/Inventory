"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { PickListTemplateForm, type TemplateFormValue } from "@/components/pick-list-template-form";

type Detail = {
  id: string;
  name: string;
  description: string | null;
  items: { itemId: string; quantity: number; notes: string | null }[];
  updatedAt?: string;
};

export default function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useQuery({
    queryKey: ["pl-template", id],
    queryFn: () => api.get<Detail>(`/api/pick-list-templates/${id}`),
    // Never seed the form from a stale cached copy.
    refetchOnMount: "always",
    staleTime: 0,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  const initial: TemplateFormValue = {
    id: data.id,
    name: data.name,
    description: data.description ?? "",
    items: data.items.map((it) => ({
      itemId: it.itemId,
      quantity: it.quantity,
      notes: it.notes ?? "",
    })),
  };
  return <PickListTemplateForm key={data.updatedAt ?? data.id} mode="edit" initial={initial} />;
}
