"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/dialog-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type CheckoutRow = {
  id: string;
  quantity: number;
  checkedOutAt: string;
  expectedReturnAt: string | null;
  returnedAt: string | null;
  notes: string | null;
  item: { id: string; name: string; unit: string | null };
  user: { id: string; name: string | null; email: string };
};

export default function AdminCheckoutsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"active" | "all">("active");

  const rows = useQuery({
    queryKey: ["checkouts-admin", tab],
    queryFn: () => api.get<CheckoutRow[]>(`/api/checkouts${tab === "active" ? "?status=active" : ""}`),
  });

  const ret = useMutation({
    mutationFn: (id: string) => api.patch(`/api/checkouts/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkouts-admin"] });
      toast.success("Returned.");
    },
    onError: (e) => toast.error(String(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/checkouts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkouts-admin"] });
      toast.success("Deleted.");
    },
    onError: (e) => toast.error(String(e)),
  });

  function overdue(c: CheckoutRow) {
    return !!c.expectedReturnAt && new Date(c.expectedReturnAt) < new Date() && !c.returnedAt;
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin"><ChevronLeft className="h-4 w-4" /> Admin</Link>
      </Button>

      <header>
        <h1 className="text-2xl font-bold">Checkouts</h1>
        <p className="text-sm text-muted-foreground">All borrows across the team.</p>
      </header>

      <div className="flex gap-2">
        <Button variant={tab === "active" ? "default" : "outline"} onClick={() => setTab("active")}>Active</Button>
        <Button variant={tab === "all" ? "default" : "outline"} onClick={() => setTab("all")}>All</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>{tab === "active" ? "Currently out" : "All checkouts"} ({rows.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {rows.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!rows.isLoading && (rows.data?.length ?? 0) === 0 && (
            <div className="text-sm text-muted-foreground">
              {tab === "active" ? "Nothing checked out right now. 👍" : "No checkout records yet."}
            </div>
          )}
          {/* Desktop: table; Mobile: card list. Same data, different layout. */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Borrower</th>
                  <th className="py-2 pr-3">Out</th>
                  <th className="py-2 pr-3">Expected back</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.data?.map((c) => (
                  <tr key={c.id} className="border-b last:border-none">
                    <td className="py-2 pr-3">
                      <Link href={`/items/${c.item.id}`} className="font-medium underline">{c.item.name}</Link>
                    </td>
                    <td className="py-2 pr-3">{c.quantity}</td>
                    <td className="py-2 pr-3">{c.user.name ?? c.user.email}</td>
                    <td className="py-2 pr-3">{formatDate(c.checkedOutAt)}</td>
                    <td className="py-2 pr-3">{c.expectedReturnAt ? formatDate(c.expectedReturnAt) : "—"}</td>
                    <td className="py-2 pr-3">
                      {c.returnedAt
                        ? <Badge variant="ok">Returned {formatDate(c.returnedAt)}</Badge>
                        : overdue(c)
                          ? <Badge variant="danger">Overdue</Badge>
                          : <Badge variant="warn">Active</Badge>}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="inline-flex gap-2">
                        {!c.returnedAt && (
                          <Button size="sm" onClick={() => ret.mutate(c.id)} disabled={ret.isPending}>
                            <CheckCircle2 className="h-4 w-4" /> Mark returned
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            const ok = await confirm({
                              title: "Delete checkout record?",
                              description: c.returnedAt
                                ? "This permanently removes the history of this checkout."
                                : "This is an active checkout. Deleting will refund the quantity to stock.",
                              confirmText: "Delete",
                              variant: "destructive",
                            });
                            if (ok) del.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {rows.data?.map((c) => (
              <div key={c.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/items/${c.item.id}`} className="font-medium underline block truncate">
                      {c.item.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      Qty {c.quantity} · {c.user.name ?? c.user.email}
                    </div>
                  </div>
                  {c.returnedAt
                    ? <Badge variant="ok">Returned</Badge>
                    : overdue(c)
                      ? <Badge variant="danger">Overdue</Badge>
                      : <Badge variant="warn">Active</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Out {formatDate(c.checkedOutAt)}
                  {c.expectedReturnAt && ` · expected ${formatDate(c.expectedReturnAt)}`}
                  {c.returnedAt && ` · returned ${formatDate(c.returnedAt)}`}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {!c.returnedAt && (
                    <Button size="sm" onClick={() => ret.mutate(c.id)} disabled={ret.isPending} className="flex-1">
                      <CheckCircle2 className="h-4 w-4" /> Mark returned
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Delete checkout record?",
                        description: c.returnedAt
                          ? "This permanently removes the history of this checkout."
                          : "This is an active checkout. Deleting will refund the quantity to stock.",
                        confirmText: "Delete",
                        variant: "destructive",
                      });
                      if (ok) del.mutate(c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
