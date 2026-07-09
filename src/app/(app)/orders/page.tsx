"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Plus, Truck, ExternalLink } from "lucide-react";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateOnly } from "@/lib/utils";

type Row = {
  id: string;
  vendor: string;
  orderNumber: string | null;
  trackingUrl: string | null;
  status: "DRAFT" | "ORDERED" | "SHIPPED" | "PARTIAL" | "RECEIVED" | "CANCELED";
  orderedAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  _count: { lines: number };
};

const statusVariant: Record<Row["status"], "outline" | "secondary" | "warn" | "ok" | "danger"> = {
  DRAFT: "outline",
  ORDERED: "outline",
  SHIPPED: "secondary",
  PARTIAL: "warn",
  RECEIVED: "ok",
  CANCELED: "danger",
};

export default function OrdersPage() {
  const { data: session } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<Row[]>("/api/orders"),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" /> Incoming orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Track vendor orders. Receiving against an order auto-adds stock.
          </p>
        </div>
        {can(session?.user.role, "import:bulk") && (
          <Button asChild>
            <Link href="/orders/new"><Plus className="h-4 w-4" /> New order</Link>
          </Button>
        )}
      </header>

      <Card>
        <CardHeader><CardTitle>Orders</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {data?.length === 0 && !isLoading && (
            <div className="text-sm text-muted-foreground">No incoming orders yet.</div>
          )}
          {data?.map((o) => (
            // Wrapper is a div, not a Link — we have an inner Tracking <a>, and React (correctly)
            // refuses to nest <a> inside <a>. We make the whole row clickable via JS instead.
            <div
              key={o.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent transition-colors cursor-pointer"
              onClick={() => { window.location.href = `/orders/${o.id}`; }}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") window.location.href = `/orders/${o.id}`; }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{o.vendor}</span>
                  {o.orderNumber && <span className="text-xs text-muted-foreground">#{o.orderNumber}</span>}
                  <Badge variant={statusVariant[o.status]}>{o.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Ordered {formatDate(o.orderedAt)}
                  {o.expectedAt && ` · expected ${formatDateOnly(o.expectedAt)}`}
                  {o.receivedAt && ` · received ${formatDate(o.receivedAt)}`}
                  {` · ${o._count.lines} line${o._count.lines === 1 ? "" : "s"}`}
                </div>
              </div>
              {o.trackingUrl && (
                <a
                  href={o.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary hover:underline text-xs inline-flex items-center gap-1"
                >
                  Track <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
