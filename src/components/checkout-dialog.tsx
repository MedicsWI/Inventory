"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, PackageOpen } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type User = { id: string; name: string | null; email: string };

export function CheckoutDialog({
  itemId,
  itemName,
  available,
  onClose,
  onDone,
}: {
  itemId: string;
  itemName: string;
  available: number;
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [userId, setUserId] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [expectedReturnAt, setExpectedReturnAt] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Pull list of users to pick a borrower. Medics can only check out to themselves.
  const users = useQuery({
    queryKey: ["users-or-me"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (res.ok) return (await res.json()) as User[];
      // Medics get 403; fall back to "me"
      const me = await fetch("/api/auth/session", { credentials: "include" });
      const session = await me.json();
      return session?.user ? [{ id: session.user.id, name: session.user.name, email: session.user.email }] : [];
    },
  });

  React.useEffect(() => {
    if (!userId && users.data && users.data.length === 1) setUserId(users.data[0].id);
  }, [userId, users.data]);

  const checkout = useMutation({
    mutationFn: () =>
      api.post("/api/checkouts", {
        itemId,
        userId,
        quantity: Number(quantity),
        expectedReturnAt: expectedReturnAt ? new Date(expectedReturnAt).toISOString() : null,
        notes: notes || null,
      }),
    onSuccess: () => {
      toast.success("Checked out.");
      qc.invalidateQueries({ queryKey: ["item", itemId] });
      qc.invalidateQueries({ queryKey: ["item-checkouts", itemId] });
      qc.invalidateQueries({ queryKey: ["checkouts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onDone?.();
      onClose();
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-card text-card-foreground shadow-xl border">
        <div className="p-5 border-b flex items-center gap-2">
          <PackageOpen className="h-5 w-5 text-primary" />
          <div className="font-semibold">Check out: {itemName}</div>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-sm text-muted-foreground">Available now: <span className="font-medium text-foreground">{available}</span></div>

          <div className="space-y-1">
            <Label>Borrower</Label>
            <select
              className="h-12 w-full rounded-md border bg-background px-3"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">— pick a person —</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              max={available}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(available, Number(e.target.value) || 1)))}
            />
          </div>

          <div className="space-y-1">
            <Label>Expected return (optional)</Label>
            <Input
              type="date"
              value={expectedReturnAt}
              onChange={(e) => setExpectedReturnAt(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Serial #, condition, where it's going…" />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => checkout.mutate()} disabled={!userId || checkout.isPending || quantity < 1}>
            {checkout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Check out
          </Button>
        </div>
      </div>
    </div>
  );
}
