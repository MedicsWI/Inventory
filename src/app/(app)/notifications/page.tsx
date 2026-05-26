"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Trash2, RefreshCw, Clock, AlertTriangle, Package } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RowsSkeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";

type Notification = {
  id: string;
  type: "EXPIRING_SOON" | "EXPIRED" | "LOW_STOCK" | "SYSTEM";
  title: string;
  body: string | null;
  payload: { itemId?: string } | null;
  read: boolean;
  createdAt: string;
};

function iconFor(type: Notification["type"]) {
  switch (type) {
    case "EXPIRED": return AlertTriangle;
    case "EXPIRING_SOON": return Clock;
    case "LOW_STOCK": return Package;
    default: return Bell;
  }
}

function colorFor(type: Notification["type"]): "danger" | "warn" | "secondary" | "outline" {
  switch (type) {
    case "EXPIRED": return "danger";
    case "EXPIRING_SOON": return "warn";
    case "LOW_STOCK": return "warn";
    default: return "outline";
  }
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ rows: Notification[]; unreadCount: number }>("/api/notifications"),
  });

  const runCheck = useMutation({
    mutationFn: () => api.post("/api/notifications/check", {}),
    onSuccess: (r) => {
      const created = (r as { created: number }).created;
      toast.success(created ? `${created} new notifications` : "No new alerts");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/notifications/${id}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => api.post("/api/notifications/mark-all-read", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notifications
            {data && data.unreadCount > 0 && (
              <Badge variant="danger">{data.unreadCount} unread</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">Expirations and low-stock alerts.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => runCheck.mutate()} disabled={runCheck.isPending}>
            <RefreshCw className={`h-4 w-4 ${runCheck.isPending ? "animate-spin" : ""}`} />
            Check now
          </Button>
          <Button variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <Check className="h-4 w-4" /> Mark all read
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>Recent</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <RowsSkeleton rows={6} />}
          {data?.rows.length === 0 && !isLoading && (
            <div className="text-sm text-muted-foreground">No notifications yet. Tap "Check now" to scan.</div>
          )}
          {data?.rows.map((n) => {
            const Icon = iconFor(n.type);
            const itemId = n.payload?.itemId;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-md border p-3 ${n.read ? "opacity-60" : "bg-card"}`}
              >
                <Icon className={`h-5 w-5 mt-0.5 ${n.read ? "text-muted-foreground" : "text-primary"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={colorFor(n.type)}>{n.type.replace("_", " ")}</Badge>
                    {!n.read && <Badge variant="secondary">new</Badge>}
                  </div>
                  <div className="font-medium mt-1">
                    {itemId ? <Link className="underline" href={`/items/${itemId}`}>{n.title}</Link> : n.title}
                  </div>
                  {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                  <div className="text-xs text-muted-foreground mt-1">{formatDate(n.createdAt)}</div>
                </div>
                <div className="flex flex-col gap-1">
                  {!n.read && (
                    <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(n.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
