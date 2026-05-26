"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { EventTemplateForm, type EventTemplateFormValue } from "@/components/event-template-form";

type Detail = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  notes: string | null;
  gearCategories: string[];
  shifts: {
    id: string;
    name: string;
    startsAtTime: string | null;
    endsAtTime: string | null;
    sortOrder: number;
  }[];
};

export default function EditEventTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useQuery({
    queryKey: ["event-template", id],
    queryFn: () => api.get<Detail>(`/api/event-templates/${id}`),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  const initial: EventTemplateFormValue = {
    id: data.id,
    name: data.name,
    description: data.description ?? "",
    location: data.location ?? "",
    notes: data.notes ?? "",
    gearCategories: data.gearCategories,
    shifts: data.shifts
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        name: s.name,
        startsAtTime: s.startsAtTime ?? "",
        endsAtTime: s.endsAtTime ?? "",
      })),
  };
  return <EventTemplateForm mode="edit" initial={initial} />;
}
