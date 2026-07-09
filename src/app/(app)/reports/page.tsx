"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BarChart3, Boxes, MapPin, Tag, Clock, PackageOpen, Download } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ReportData = {
  totals: { items: number; totalQuantity: number; locations: number; categories: number; tags: number };
  returnableStats: { returnableItems: number; activeCheckouts: number; totalOut: number };
  expirationBuckets: { expired: number; d30: number; d60: number; d90: number; beyond: number; none: number };
  byCategory: { categoryId: string | null; name: string; itemCount: number; totalQty: number }[];
  byLocation: { locationId: string | null; name: string; itemCount: number; totalQty: number }[];
};

export default function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.get<ReportData>("/api/reports"),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground">Snapshot of inventory shape and status.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/export"><Download className="h-4 w-4" /> Export raw data</Link>
        </Button>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {data && (
        <>
          {/* Top-line */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Items" value={data.totals.items} icon={Boxes} />
            <Stat label="Total units" value={data.totals.totalQuantity} icon={Boxes} />
            <Stat label="Locations" value={data.totals.locations} icon={MapPin} />
            <Stat label="Categories" value={data.totals.categories} icon={Tag} />
            <Stat label="Tags" value={data.totals.tags} icon={Tag} />
          </div>

          {/* Returnable equipment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PackageOpen className="h-4 w-4" /> Returnable equipment</CardTitle>
              <CardDescription>BP cuffs, glucometers, radios — anything that's checked out and returned.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-sm">
              <Mini label="Marked returnable" value={data.returnableStats.returnableItems} />
              <Mini label="Active checkouts" value={data.returnableStats.activeCheckouts} />
              <Mini label="Units out" value={data.returnableStats.totalOut} />
            </CardContent>
          </Card>

          {/* Expiration buckets */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Expiration timeline</CardTitle>
              <CardDescription>Bucket counts across the next 90 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <BucketBar buckets={data.expirationBuckets} />
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4 text-xs">
                <BucketLegend label="Expired" value={data.expirationBuckets.expired} color="bg-danger" />
                <BucketLegend label="≤ 30d" value={data.expirationBuckets.d30} color="bg-warn" />
                <BucketLegend label="31–60d" value={data.expirationBuckets.d60} color="bg-warn/70" />
                <BucketLegend label="61–90d" value={data.expirationBuckets.d90} color="bg-warn/40" />
                <BucketLegend label="> 90d" value={data.expirationBuckets.beyond} color="bg-ok" />
                <BucketLegend label="None" value={data.expirationBuckets.none} color="bg-muted-foreground/40" />
              </div>
            </CardContent>
          </Card>

          {/* By category */}
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader>
                <CardTitle>Items by category</CardTitle>
              </CardHeader>
              <CardContent>
                <TableLite
                  rows={data.byCategory.map((c) => ({
                    label: c.name,
                    a: c.itemCount,
                    b: c.totalQty,
                  }))}
                  aLabel="SKUs"
                  bLabel="Units"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Items by location</CardTitle>
              </CardHeader>
              <CardContent>
                <TableLite
                  rows={data.byLocation.map((c) => ({
                    label: c.name,
                    a: c.itemCount,
                    b: c.totalQty,
                  }))}
                  aLabel="SKUs"
                  bLabel="Units"
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Boxes }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase">{label}</CardTitle>
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function BucketBar({ buckets }: { buckets: { expired: number; d30: number; d60: number; d90: number; beyond: number; none: number } }) {
  const total =
    buckets.expired + buckets.d30 + buckets.d60 + buckets.d90 + buckets.beyond + buckets.none || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="h-6 w-full rounded-md overflow-hidden flex border">
      <span className="bg-danger h-full" style={{ width: seg(buckets.expired) }} title={`Expired: ${buckets.expired}`} />
      <span className="bg-warn h-full" style={{ width: seg(buckets.d30) }} title={`≤30d: ${buckets.d30}`} />
      <span className="bg-warn/70 h-full" style={{ width: seg(buckets.d60) }} title={`31–60d: ${buckets.d60}`} />
      <span className="bg-warn/40 h-full" style={{ width: seg(buckets.d90) }} title={`61–90d: ${buckets.d90}`} />
      <span className="bg-ok h-full" style={{ width: seg(buckets.beyond) }} title={`>90d: ${buckets.beyond}`} />
      <span className="bg-muted-foreground/40 h-full" style={{ width: seg(buckets.none) }} title={`None: ${buckets.none}`} />
    </div>
  );
}

function BucketLegend({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  );
}

function TableLite({
  rows,
  aLabel,
  bLabel,
}: {
  rows: { label: string; a: number; b: number }[];
  aLabel: string;
  bLabel: string;
}) {
  if (rows.length === 0) return <div className="text-sm text-muted-foreground">No data.</div>;
  const maxA = Math.max(...rows.map((r) => r.a), 1);
  return (
    <div className="space-y-1.5">
      {/* Index-suffixed key — category/location names aren't guaranteed unique
          (e.g. "Uncategorized" vs a real category named the same). */}
      {rows.map((r, i) => (
        <div key={`${r.label}:${i}`} className="text-sm">
          <div className="flex items-center justify-between">
            <span className="truncate font-medium">{r.label}</span>
            <span className="text-xs text-muted-foreground">{r.a} {aLabel} · {r.b} {bLabel}</span>
          </div>
          <div className="h-1.5 w-full rounded bg-muted overflow-hidden mt-1">
            <span className="block h-full bg-primary" style={{ width: `${(r.a / maxA) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
