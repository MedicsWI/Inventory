"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = { id: string; name: string; description: string | null; _count: { items: number } };

export default function TemplatesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["pl-templates"],
    queryFn: () => api.get<Row[]>("/api/pick-list-templates"),
  });

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/pick-lists"><ChevronLeft className="h-4 w-4" /> Back to pick lists</Link>
      </Button>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" /> Pick list templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Reusable definitions. Start a pick list from a template to get its line items pre-filled.
          </p>
        </div>
        <Button asChild>
          <Link href="/pick-list-templates/new"><Plus className="h-4 w-4" /> New template</Link>
        </Button>
      </header>

      <Card>
        <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {data?.length === 0 && !isLoading && (
            <div className="text-sm text-muted-foreground">No templates yet.</div>
          )}
          {data?.map((t) => (
            <Link
              key={t.id}
              href={`/pick-list-templates/${t.id}`}
              className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium">{t.name}</div>
                {t.description && <div className="text-xs text-muted-foreground mt-1">{t.description}</div>}
                <div className="text-xs text-muted-foreground mt-1">{t._count.items} items</div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
