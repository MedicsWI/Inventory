"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ScanLine, Plus, Boxes, Clock, Megaphone } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { DashboardStats } from "@/components/dashboard-stats";
import { ItemCard, type ItemCardData } from "@/components/item-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatsSkeleton, ListSkeleton, RowsSkeleton } from "@/components/ui/skeleton";
import { AttentionPanel } from "@/components/attention-panel";
import { formatDate, actionLabel } from "@/lib/utils";

type DashboardData = {
  totals: { items: number; locations: number; expiringSoon: number; lowStock: number };
  expiringItems: ItemCardData[];
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    entityName: string | null;
    createdAt: string;
    user?: { name?: string | null; email?: string | null } | null;
  }[];
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/api/dashboard"),
  });
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN" || session?.user.role === "MANAGER";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Snapshot of inventory across Medics WI.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/scan"><ScanLine className="h-4 w-4" /> Scan</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/items/new"><Plus className="h-4 w-4" /> Add item</Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="outline" className="border-brand-red/40 text-brand-red hover:bg-brand-red/10">
              <Link href="/alert-groups"><Megaphone className="h-4 w-4" /> Send alert</Link>
            </Button>
          )}
        </div>
      </header>

      {/* Triage panel — only renders when something needs attention. Lives above
          the stats so urgent items are the first thing anyone sees on login. */}
      <AttentionPanel />

      {isLoading ? (
        <StatsSkeleton />
      ) : (
        <DashboardStats
          totals={
            data?.totals ?? { items: 0, locations: 0, expiringSoon: 0, lowStock: 0 }
          }
        />
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Expiring next 30 days</CardTitle>
              <Button asChild variant="link" className="h-8 px-2">
                <Link href="/expiring">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <ListSkeleton rows={3} />}
            {!isLoading && (data?.expiringItems?.length ?? 0) === 0 && (
              <div className="text-sm text-muted-foreground">Nothing expiring soon. 🎉</div>
            )}
            {data?.expiringItems?.map((it) => <ItemCard key={it.id} item={it} compact />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Recent activity</CardTitle>
              <Button asChild variant="link" className="h-8 px-2">
                <Link href="/activity">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isLoading && <RowsSkeleton rows={5} />}
            {data?.recentActivity?.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-none">
                <div className="min-w-0">
                  <div className="truncate">
                    <span className="font-medium">{a.user?.name || a.user?.email || "System"}</span>{" "}
                    <span className="text-muted-foreground">{actionLabel(a.action)}</span>{" "}
                    <span className="font-medium">{a.entityName ?? `${a.entityType.toLowerCase()} #${a.entityId.slice(0, 8)}`}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(a.createdAt)}</span>
              </div>
            ))}
            {(data?.recentActivity?.length ?? 0) === 0 && !isLoading && (
              <div className="text-muted-foreground">No activity yet.</div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
