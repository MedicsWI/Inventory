"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Plus, Settings } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  _count: { shifts: number; spawned: number };
};

export default function EventTemplatesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["event-templates"],
    queryFn: () => api.get<Row[]>("/api/event-templates"),
  });

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/events"><ChevronLeft className="h-4 w-4" /> Back to events</Link>
      </Button>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" /> Event templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Reusable definitions for recurring details. Spawn a fresh dated event from any template.
          </p>
        </div>
        <Button asChild>
          <Link href="/event-templates/new"><Plus className="h-4 w-4" /> New template</Link>
        </Button>
      </header>

      <Card>
        <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && data?.length === 0 && (
            <div className="text-sm text-muted-foreground">No templates yet.</div>
          )}
          {data?.map((t) => (
            <Link
              key={t.id}
              href={`/event-templates/${t.id}`}
              className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium">{t.name}</div>
                {t.description && <div className="text-xs text-muted-foreground mt-1">{t.description}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  {t._count.shifts} shift{t._count.shifts === 1 ? "" : "s"}
                  {t.location && ` · ${t.location}`}
                  {t._count.spawned > 0 && ` · ${t._count.spawned} event${t._count.spawned === 1 ? "" : "s"} spawned`}
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
