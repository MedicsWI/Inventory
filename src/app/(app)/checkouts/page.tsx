"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { CheckCircle2, PackageOpen, Clock, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
  item: { id: string; name: string; unit: string | null; returnable: boolean; photoUrl: string | null };
  user: { id: string; name: string | null; email: string };
};

export default function MyCheckoutsPage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN" || session?.user.role === "MANAGER";
  const active = useQuery({
    queryKey: ["checkouts", "mine-active"],
    queryFn: () => api.get<CheckoutRow[]>(`/api/checkouts?mine=1&status=active`),
  });
  const history = useQuery({
    queryKey: ["checkouts", "mine-returned"],
    queryFn: () => api.get<CheckoutRow[]>(`/api/checkouts?mine=1&status=returned`),
  });

  const ret = useMutation({
    mutationFn: (id: string) => api.patch(`/api/checkouts/${id}`, {}),
    onSuccess: () => {
      toast.success("Returned.");
      qc.invalidateQueries({ queryKey: ["checkouts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  function overdue(row: CheckoutRow): boolean {
    return !!row.expectedReturnAt && new Date(row.expectedReturnAt) < new Date() && !row.returnedAt;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My checkouts</h1>
          <p className="text-sm text-muted-foreground">Equipment you currently have signed out.</p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link href="/admin/checkouts">
              <PackageCheck className="h-4 w-4" /> View all checkouts
            </Link>
          </Button>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PackageOpen className="h-4 w-4" /> Active ({active.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {active.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {active.data?.length === 0 && !active.isLoading && (
            <div className="text-sm text-muted-foreground">Nothing checked out. 👍</div>
          )}
          {active.data?.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/items/${c.item.id}`} className="font-medium underline truncate">{c.item.name}</Link>
                  <Badge variant="secondary">Qty {c.quantity}</Badge>
                  {overdue(c) && <Badge variant="danger">Overdue</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Out since {formatDate(c.checkedOutAt)}
                  {c.expectedReturnAt && <> · expected {formatDate(c.expectedReturnAt)}</>}
                </div>
                {c.notes && <div className="text-xs mt-1">{c.notes}</div>}
              </div>
              <Button size="sm" onClick={() => ret.mutate(c.id)} disabled={ret.isPending}>
                <CheckCircle2 className="h-4 w-4" /> Return
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {history.isLoading && <div className="text-muted-foreground">Loading…</div>}
          {history.data?.length === 0 && !history.isLoading && (
            <div className="text-muted-foreground">No past checkouts yet.</div>
          )}
          {history.data?.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b py-2 last:border-none">
              <div className="min-w-0">
                <Link href={`/items/${c.item.id}`} className="font-medium underline">{c.item.name}</Link>
                <span className="text-xs text-muted-foreground"> · qty {c.quantity}</span>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(c.checkedOutAt)} → {formatDate(c.returnedAt)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
