"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ChevronLeft, Minus, Plus, Trash2, QrCode, Pencil, Check, PackageOpen, CheckCircle2, History } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/dialog-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExpirationBadge } from "@/components/expiration-badge";
import { BarcodeLabel } from "@/components/barcode-label";
import { CheckoutDialog } from "@/components/checkout-dialog";
import { formatDate } from "@/lib/utils";

type ItemDetail = {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  quantity: number;
  unit?: string | null;
  lotNumber?: string | null;
  expirationDate?: string | null;
  lowStockThreshold?: number | null;
  photoUrl?: string | null;
  notes?: string | null;
  returnable?: boolean;
  location?: { id: string; name: string } | null;
  category?: { id: string; name: string; color?: string | null } | null;
  tags?: { id: string; name: string; color?: string | null }[];
};

type ActiveCheckout = {
  id: string;
  quantity: number;
  checkedOutAt: string;
  expectedReturnAt: string | null;
  user: { id: string; name: string | null; email: string };
};

export default function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: session } = useSession();
  const canEdit = can(session?.user.role, "item:update");
  const canDelete = can(session?.user.role, "item:delete");
  const { data, isLoading } = useQuery({
    queryKey: ["item", id],
    queryFn: () => api.get<ItemDetail>(`/api/items/${id}`),
  });
  const activeOuts = useQuery({
    queryKey: ["item-checkouts", id],
    queryFn: () => api.get<ActiveCheckout[]>(`/api/checkouts?itemId=${id}&status=active`),
    enabled: !!data?.returnable,
  });

  const [showQr, setShowQr] = useState(false);
  const [touched, setTouched] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const adjustQty = useMutation({
    // Atomic delta — see /api/items/[id] quantityDelta.
    mutationFn: (delta: number) =>
      api.patch<ItemDetail>(`/api/items/${id}`, { quantityDelta: delta }),
    onSuccess: () => {
      setTouched(true);
      qc.invalidateQueries({ queryKey: ["item", id] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const returnOne = useMutation({
    mutationFn: (cid: string) => api.patch(`/api/checkouts/${cid}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item", id] });
      qc.invalidateQueries({ queryKey: ["item-checkouts", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Returned.");
    },
    onError: (e) => toast.error(String(e)),
  });

  const del = useMutation({
    mutationFn: () => api.del(`/api/items/${id}`),
    onSuccess: () => {
      toast.success("Item deleted.");
      router.push("/items");
    },
    onError: (e) => toast.error(String(e)),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  const totalOut = activeOuts.data?.reduce((acc, c) => acc + c.quantity, 0) ?? 0;

  return (
    <div className="space-y-4 pb-24 md:pb-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link href="/items"><ChevronLeft className="h-4 w-4" /> All items</Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/items/${id}/history`}><History className="h-4 w-4" /> History</Link>
          </Button>
          {canEdit && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/items/${id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
            </Button>
          )}
        </div>
      </div>

      <header className="flex items-start gap-4">
        {data.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.photoUrl} alt={data.name} className="h-24 w-24 object-cover rounded-lg border shrink-0" />
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {data.category && <Badge variant="secondary">{data.category.name}</Badge>}
            {data.returnable && <Badge variant="ok">Returnable</Badge>}
            {data.tags?.map((t) => <Badge key={t.id} variant="outline">#{t.name}</Badge>)}
          </div>
          <h1 className="text-2xl font-bold mt-1">{data.name}</h1>
          {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>On hand</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              variant="outline"
              onClick={() => adjustQty.mutate(-1)}
              disabled={adjustQty.isPending || data.quantity === 0}
              aria-label="Decrease quantity"
            >
              <Minus className="h-6 w-6" />
            </Button>
            <div className="text-4xl font-bold tabular-nums min-w-[3ch] text-center">{data.quantity}</div>
            <Button
              size="lg"
              onClick={() => adjustQty.mutate(+1)}
              disabled={adjustQty.isPending}
              aria-label="Increase quantity"
            >
              <Plus className="h-6 w-6" />
            </Button>
            <div className="ml-3 text-sm text-muted-foreground">{data.unit ?? ""}</div>
          </div>
          {data.returnable && totalOut > 0 && (
            <div className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{totalOut}</span> currently checked out · Total stock {data.quantity + totalOut}
            </div>
          )}
          {data.lowStockThreshold != null && data.quantity <= data.lowStockThreshold && (
            <div className="mt-2 text-sm text-danger font-medium">
              Low stock (threshold: {data.lowStockThreshold})
            </div>
          )}
          {data.returnable && (
            <div className="mt-3">
              <Button onClick={() => setShowCheckout(true)} disabled={data.quantity < 1}>
                <PackageOpen className="h-4 w-4" /> Check out
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {data.returnable && (activeOuts.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Currently checked out</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeOuts.data?.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0">
                  <div className="font-medium">{c.user.name ?? c.user.email}</div>
                  <div className="text-xs text-muted-foreground">
                    Qty {c.quantity} · since {formatDate(c.checkedOutAt)}
                    {c.expectedReturnAt && <> · expected {formatDate(c.expectedReturnAt)}</>}
                  </div>
                </div>
                <Button size="sm" onClick={() => returnOne.mutate(c.id)} disabled={returnOne.isPending}>
                  <CheckCircle2 className="h-4 w-4" /> Return
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-y-2 text-sm">
          <Detail label="Location">
            {data.location ? (
              <Link className="underline" href={`/locations/${data.location.id}`}>{data.location.name}</Link>
            ) : "—"}
          </Detail>
          <Detail label="SKU">{data.sku ?? "—"}</Detail>
          <Detail label="Barcode">{data.barcode ?? "—"}</Detail>
          <Detail label="Lot number">{data.lotNumber ?? "—"}</Detail>
          <Detail label="Expires">
            <div className="flex items-center gap-2">
              <span>{data.expirationDate ? formatDate(data.expirationDate) : "—"}</span>
              <ExpirationBadge date={data.expirationDate ?? null} />
            </div>
          </Detail>
          <Detail label="Low-stock threshold">{data.lowStockThreshold ?? "—"}</Detail>
          {data.notes && (
            <div className="col-span-2">
              <div className="text-muted-foreground">Notes</div>
              <div>{data.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {data.barcode && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><QrCode className="h-4 w-4" /> Label</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowQr((v) => !v)}>
                {showQr ? "Hide" : "Show"}
              </Button>
            </div>
          </CardHeader>
          {showQr && (
            <CardContent>
              <BarcodeLabel value={data.barcode} title={data.name} subtitle={data.category?.name ?? undefined} symbology="qrcode" />
            </CardContent>
          )}
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {canDelete && (
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: `Delete ${data.name}?`,
                description: "This removes the item from inventory. History stays in the activity log.",
                confirmText: "Delete item",
                variant: "destructive",
              });
              if (ok) del.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      {touched && (
        <div
          className="fixed inset-x-0 bottom-16 md:bottom-4 z-40 mx-auto w-full max-w-md px-4"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Button
            size="lg"
            className="w-full shadow-lg"
            onClick={() => router.push("/items")}
          >
            <Check className="h-5 w-5" /> Done
          </Button>
        </div>
      )}

      {showCheckout && (
        <CheckoutDialog
          itemId={id}
          itemName={data.name}
          available={data.quantity}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
