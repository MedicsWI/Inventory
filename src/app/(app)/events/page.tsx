"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, CalendarDays, Settings } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RowsSkeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "CLOSED" | "CANCELED";
  startsAt: string | null;
  location: string | null;
  _count: { signOuts: number };
};

const statusVariant: Record<Row["status"], "outline" | "warn" | "ok" | "danger"> = {
  PLANNED: "outline",
  ACTIVE: "warn",
  CLOSED: "ok",
  CANCELED: "danger",
};

export default function EventsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<Row[]>("/api/events"),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Events
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign-out sheets for shifts, details, game days, etc. Replaces the paper Equipment Sign-Out form.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline">
            <Link href="/event-templates"><Settings className="h-4 w-4" /> Templates</Link>
          </Button>
          <Button asChild>
            <Link href="/events/new"><Plus className="h-4 w-4" /> New event</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>All events</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <RowsSkeleton rows={4} />}
          {!isLoading && data?.length === 0 && (
            <div className="text-sm text-muted-foreground">No events yet — tap "New event" to start your first sign-out sheet.</div>
          )}
          {data?.map((e) => (
            <Link
              key={e.id}
              href={`/events/${e.id}`}
              className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{e.name}</span>
                  <Badge variant={statusVariant[e.status]}>{e.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {e.startsAt ? formatDate(e.startsAt) : "No date"}
                  {e.location && ` · ${e.location}`}
                  {` · ${e._count.signOuts} ${e._count.signOuts === 1 ? "person" : "people"}`}
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
