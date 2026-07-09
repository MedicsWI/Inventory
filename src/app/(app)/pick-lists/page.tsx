"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Plus, ListChecks, Settings } from "lucide-react";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  destination: string | null;
  createdAt: string;
  completedAt: string | null;
  fromLocation: { id: string; name: string } | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  template: { id: string; name: string } | null;
  _count: { lines: number };
};

const statusVariant: Record<Row["status"], "outline" | "warn" | "ok" | "danger"> = {
  DRAFT: "outline",
  IN_PROGRESS: "warn",
  COMPLETED: "ok",
  CANCELED: "danger",
};

export default function PickListsPage() {
  const { data: session } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["pick-lists"],
    queryFn: () => api.get<Row[]>("/api/pick-lists"),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6" /> Pick lists
          </h1>
          <p className="text-sm text-muted-foreground">
            Pull a set of items from stock. Once completed, source quantities are decremented.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline">
            <Link href="/pick-list-templates"><Settings className="h-4 w-4" /> Templates</Link>
          </Button>
          {can(session?.user.role, "location:create") && (
            <Button asChild>
              <Link href="/pick-lists/new"><Plus className="h-4 w-4" /> New pick list</Link>
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>Lists</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {data?.length === 0 && !isLoading && (
            <div className="text-sm text-muted-foreground">No pick lists yet.</div>
          )}
          {data?.map((p) => (
            <Link
              key={p.id}
              href={`/pick-lists/${p.id}`}
              className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant={statusVariant[p.status]}>{p.status.replace("_", " ")}</Badge>
                  {p.template && <Badge variant="outline">tmpl: {p.template.name}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {p.fromLocation && <>From {p.fromLocation.name} · </>}
                  {p.destination && <>To {p.destination} · </>}
                  {p.assignedTo && <>Assigned: {p.assignedTo.name ?? p.assignedTo.email} · </>}
                  {p._count.lines} lines · created {formatDate(p.createdAt)}
                  {p.completedAt && ` · completed ${formatDate(p.completedAt)}`}
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
