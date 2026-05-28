"use client";

// AttentionPanel — surfaces time-sensitive triage items on the dashboard.
// Pulls from /api/dashboard/attention. Quiet by design: renders nothing if
// every list is empty.

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, PackageOpen, ClipboardCheck, ListChecks, Truck, ChevronRight } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type ExpItem = { id: string; name: string; quantity: number; unit: string | null; expirationDate: string | null; daysOut: number | null };
type LowItem = { id: string; name: string; quantity: number; unit: string | null; lowStockThreshold: number };
type StalledCount = { id: string; name: string; updatedAt: string };
type LatePick = { id: string; name: string; status: string; createdAt: string };
type LateOrder = { id: string; vendor: string; orderNumber: string | null; expectedAt: string; status: string };

type AttentionData = {
  urgentExpiring: { total: number; sample: ExpItem[] };
  lowStock: { total: number; sample: LowItem[] };
  stalledCounts: { total: number; sample: StalledCount[] };
  latePickLists: { total: number; sample: LatePick[] };
  lateOrders: { total: number; sample: LateOrder[] };
};

export function AttentionPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-attention"],
    queryFn: () => api.get<AttentionData>("/api/dashboard/attention"),
    // Light polling so a manager who comes back to the tab sees fresh state
    refetchInterval: 60_000,
  });

  if (isLoading || !data) return null;

  const totalFlagged =
    data.urgentExpiring.total +
    data.lowStock.total +
    data.stalledCounts.total +
    data.latePickLists.total +
    data.lateOrders.total;

  if (totalFlagged === 0) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-300">
          <AlertTriangle className="h-5 w-5" />
          Needs your attention
          <Badge variant="warn" className="ml-auto">{totalFlagged} flagged</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.urgentExpiring.total > 0 && (
          <Section
            icon={Clock}
            title={`Expiring in 7 days or already expired (${data.urgentExpiring.total})`}
            href="/expiring"
            accent="text-red-300"
          >
            {data.urgentExpiring.sample.map((i) => {
              const expired = (i.daysOut ?? 0) < 0;
              return (
                <Row
                  key={i.id}
                  href={`/items/${i.id}`}
                  primary={i.name}
                  secondary={
                    expired
                      ? `Expired ${Math.abs(i.daysOut ?? 0)}d ago · ${i.quantity}${i.unit ? " " + i.unit : ""} on hand`
                      : `${i.daysOut}d out · ${i.quantity}${i.unit ? " " + i.unit : ""} on hand`
                  }
                  badge={expired ? <Badge variant="danger">expired</Badge> : <Badge variant="warn">{i.daysOut}d</Badge>}
                />
              );
            })}
          </Section>
        )}

        {data.lowStock.total > 0 && (
          <Section
            icon={PackageOpen}
            title={`Low stock at or below threshold (${data.lowStock.total})`}
            href="/low-stock"
            accent="text-amber-300"
          >
            {data.lowStock.sample.map((i) => (
              <Row
                key={i.id}
                href={`/items/${i.id}`}
                primary={i.name}
                secondary={`${i.quantity}${i.unit ? " " + i.unit : ""} (threshold ${i.lowStockThreshold})`}
                badge={i.quantity === 0 ? <Badge variant="danger">out</Badge> : <Badge variant="warn">low</Badge>}
              />
            ))}
          </Section>
        )}

        {data.stalledCounts.total > 0 && (
          <Section
            icon={ClipboardCheck}
            title={`Stock counts in REVIEW > 3 days (${data.stalledCounts.total})`}
            href="/stock-counts"
            accent="text-violet-300"
          >
            {data.stalledCounts.sample.map((c) => (
              <Row
                key={c.id}
                href={`/stock-counts/${c.id}`}
                primary={c.name}
                secondary={`Waiting since ${formatDate(c.updatedAt)}`}
                badge={<Badge variant="warn">REVIEW</Badge>}
              />
            ))}
          </Section>
        )}

        {data.lateOrders.total > 0 && (
          <Section
            icon={Truck}
            title={`Orders past expected arrival (${data.lateOrders.total})`}
            href="/orders"
            accent="text-amber-300"
          >
            {data.lateOrders.sample.map((o) => (
              <Row
                key={o.id}
                href={`/orders/${o.id}`}
                primary={`${o.vendor}${o.orderNumber ? ` · ${o.orderNumber}` : ""}`}
                secondary={`Expected ${formatDate(o.expectedAt)}`}
                badge={<Badge variant="warn">{o.status}</Badge>}
              />
            ))}
          </Section>
        )}

        {data.latePickLists.total > 0 && (
          <Section
            icon={ListChecks}
            title={`My pick lists not yet completed (${data.latePickLists.total})`}
            href="/pick-lists"
            accent="text-violet-300"
          >
            {data.latePickLists.sample.map((p) => (
              <Row
                key={p.id}
                href={`/pick-lists/${p.id}`}
                primary={p.name}
                secondary={`Created ${formatDate(p.createdAt)}`}
                badge={<Badge variant="outline">{p.status.replace("_", " ")}</Badge>}
              />
            ))}
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  icon: Icon,
  title,
  href,
  accent,
  children,
}: {
  icon: typeof AlertTriangle;
  title: string;
  href: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Link
        href={href}
        className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider hover:text-foreground ${accent}`}
      >
        <Icon className="h-3 w-3" />
        <span className="flex-1">{title}</span>
        <ChevronRight className="h-3 w-3" />
      </Link>
      <div className="ml-1 pl-3 border-l border-border/40 space-y-0.5">
        {children}
      </div>
    </div>
  );
}

function Row({
  href,
  primary,
  secondary,
  badge,
}: {
  href: string;
  primary: string;
  secondary: string;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 text-sm py-1 px-2 rounded-md hover:bg-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{primary}</div>
        <div className="text-xs text-muted-foreground truncate">{secondary}</div>
      </div>
      {badge}
    </Link>
  );
}
