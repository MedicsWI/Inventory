"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search, Download, Filter, X, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Page = { rows: LogRow[]; total: number; skip: number; take: number };
type UserLite = { id: string; name: string | null; email: string };

const ENTITY_TYPES = ["ITEM", "LOCATION", "CATEGORY", "USER", "CHECKOUT", "STOCK_COUNT", "INCOMING_ORDER", "PICK_LIST"] as const;
const ACTIONS = [
  "CREATE", "UPDATE", "DELETE", "ADJUST_QTY",
  "CHECKOUT", "RETURN",
  "STOCK_COUNT_START", "STOCK_COUNT_APPROVE",
  "ORDER_RECEIVE", "ORDER_SEND",
  "PICK_LIST_START", "PICK_LIST_COMPLETE",
  "MOVE", "SCAN", "LOGIN", "LOGOUT",
] as const;

const RANGE_PRESETS: { label: string; days: number | null }[] = [
  { label: "Today", days: 1 },
  { label: "Last 7d", days: 7 },
  { label: "Last 30d", days: 30 },
  { label: "Last 90d", days: 90 },
  { label: "All time", days: null },
];

const PAGE_SIZE = 50;

export default function ActivityPage() {
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [rangeDays, setRangeDays] = useState<number | null>(30);
  const [skip, setSkip] = useState(0);

  // IMPORTANT: `since` must NOT be computed in render with Date.now() — a
  // ms-precision value in the queryKey made every render a brand-new query
  // (render → fetch → re-render → new key → fetch, forever).
  const { data, isLoading } = useQuery({
    queryKey: ["activity", { skip, q: q.trim(), userId, entityType, action, rangeDays }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("take", String(PAGE_SIZE));
      params.set("skip", String(skip));
      if (q.trim()) params.set("q", q.trim());
      if (userId) params.set("userId", userId);
      if (entityType) params.set("entityType", entityType);
      if (action) params.set("action", action);
      if (rangeDays !== null) {
        params.set("since", new Date(Date.now() - rangeDays * 86400000).toISOString());
      }
      return api.get<Page>(`/api/activity?${params.toString()}`);
    },
  });

  const { data: session } = useSession();
  const canListUsers = session?.user.role === "ADMIN" || session?.user.role === "MANAGER";
  const users = useQuery({
    queryKey: ["users-for-filter"],
    queryFn: () => api.get<UserLite[]>("/api/users"),
    enabled: canListUsers, // MEDICs get a 403 — don't fetch a filter they can't use
  });

  function entityHref(row: LogRow): string | null {
    if (row.action === "DELETE") return null;
    if (row.entityType === "ITEM") return `/items/${row.entityId}`;
    if (row.entityType === "LOCATION") return `/locations/${row.entityId}`;
    if (row.entityType === "STOCK_COUNT") return `/stock-counts/${row.entityId}`;
    if (row.entityType === "INCOMING_ORDER") return `/orders/${row.entityId}`;
    if (row.entityType === "PICK_LIST") return `/pick-lists/${row.entityId}`;
    return null;
  }

  function exportCsv() {
    // Pull a CSV version of the current filter set (excluding pagination — server caps at 50k).
    const csvParams = new URLSearchParams();
    if (q.trim()) csvParams.set("q", q.trim());
    if (userId) csvParams.set("userId", userId);
    if (entityType) csvParams.set("entityType", entityType);
    if (action) csvParams.set("action", action);
    if (rangeDays !== null) {
      csvParams.set("since", new Date(Date.now() - rangeDays * 86400000).toISOString());
    }
    csvParams.set("format", "csv");
    // Trigger download via direct nav — keeps cookies intact, no JS download dance needed.
    window.location.href = `/api/activity?${csvParams.toString()}`;
  }

  function clearFilters() {
    setQ("");
    setUserId("");
    setEntityType("");
    setAction("");
    setRangeDays(30);
    setSkip(0);
  }

  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : skip + 1;
  const showingTo = Math.min(skip + PAGE_SIZE, total);
  const hasFilters = q || userId || entityType || action || rangeDays !== 30;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-slate-300" /> Activity log
          </h1>
          <p className="text-sm text-muted-foreground">Full audit log across inventory.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by entity name, user…"
                value={q}
                onChange={(e) => { setQ(e.target.value); setSkip(0); }}
                className="pl-8"
              />
            </div>
            {canListUsers && (
              <select
                value={userId}
                onChange={(e) => { setUserId(e.target.value); setSkip(0); }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All users</option>
                {users.data?.map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                ))}
              </select>
            )}
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setSkip(0); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All entity types</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setSkip(0); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:col-span-2"
            >
              <option value="">All actions</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{actionLabel(a)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Range:</span>
            {RANGE_PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={rangeDays === p.days ? "default" : "outline"}
                onClick={() => { setRangeDays(p.days); setSkip(0); }}
              >
                {p.label}
              </Button>
            ))}
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="ml-auto">
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Results</span>
            <span className="text-xs font-normal text-muted-foreground">
              {total === 0 ? "0 entries" : `${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${total.toLocaleString()}`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {isLoading && <RowsSkeleton rows={8} />}
          {!isLoading && (data?.rows.length ?? 0) === 0 && (
            <div className="text-muted-foreground py-8 text-center">
              No activity matches these filters. Try widening the range or clearing filters.
            </div>
          )}
          {data?.rows.map((row) => {
            const href = entityHref(row);
            const label = row.entityName ?? `${row.entityType.toLowerCase().replace(/_/g, " ")} #${row.entityId.slice(0, 8)}`;
            return (
              <div key={row.id} className="flex items-start justify-between border-b border-border/60 py-2 last:border-none gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <span className="font-medium">{row.user?.name || row.user?.email || "System"}</span>{" "}
                    <Badge variant="outline" className="mx-1">{actionLabel(row.action)}</Badge>{" "}
                    {href ? (
                      <Link className="font-medium underline hover:text-primary" href={href}>{label}</Link>
                    ) : (
                      <span className="font-medium">{label}</span>
                    )}
                    <Badge variant="outline" className="ml-1 text-[10px] uppercase">{row.entityType.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">{formatDate(row.createdAt)}</span>
              </div>
            );
          })}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-3 text-xs">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
                disabled={skip === 0}
              >
                <ChevronLeft className="h-4 w-4" /> Newer
              </Button>
              <span className="text-muted-foreground">
                Page {Math.floor(skip / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE)}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSkip(skip + PAGE_SIZE)}
                disabled={skip + PAGE_SIZE >= total}
              >
                Older <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
