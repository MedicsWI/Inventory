"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RowsSkeleton } from "@/components/ui/skeleton";
import { formatDate, actionLabel } from "@/lib/utils";

type LogRow = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  user?: { name?: string | null; email?: string | null } | null;
};

export default function ActivityPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: () => api.get<LogRow[]>("/api/activity?take=200"),
  });

  function entityHref(row: LogRow): string | null {
    if (row.action === "DELETE") return null;
    if (row.entityType === "ITEM") return `/items/${row.entityId}`;
    if (row.entityType === "LOCATION") return `/locations/${row.entityId}`;
    return null;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Activity</h1>
        <p className="text-sm text-muted-foreground">Full audit log.</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Recent</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLoading && <RowsSkeleton rows={8} />}
          {!isLoading && data?.length === 0 && (
            <div className="text-muted-foreground">No activity recorded yet.</div>
          )}
          {data?.map((row) => {
            const href = entityHref(row);
            const label = row.entityName ?? `${row.entityType.toLowerCase()} #${row.entityId.slice(0, 8)}`;
            return (
              <div key={row.id} className="flex items-center justify-between border-b py-2 last:border-none gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <span className="font-medium">{row.user?.name || row.user?.email || "System"}</span>{" "}
                    <Badge variant="outline" className="mx-1">{actionLabel(row.action)}</Badge>{" "}
                    {href ? (
                      <Link className="font-medium underline" href={href}>{label}</Link>
                    ) : (
                      <span className="font-medium">{label}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(row.createdAt)}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
