"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/dialog-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Detail = {
  id: string;
  name: string;
  description: string | null;
  items: { id: string; quantity: number; notes: string | null; item: { id: string; name: string; unit: string | null; quantity: number } }[];
};

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: session } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["pl-template", id],
    queryFn: () => api.get<Detail>(`/api/pick-list-templates/${id}`),
  });

  const del = useMutation({
    mutationFn: () => api.del(`/api/pick-list-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pl-templates"] });
      toast.success("Deleted.");
      window.location.href = "/pick-list-templates";
    },
    onError: (e) => toast.error(String(e)),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/pick-list-templates"><ChevronLeft className="h-4 w-4" /> Templates</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.name}</h1>
          {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/pick-list-templates/${id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
          </Button>
          <Button asChild>
            <Link href={`/pick-lists/new?template=${id}`}>Use this template</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>Items ({data.items.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.items.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{row.item.name}</div>
                <div className="text-xs text-muted-foreground">
                  In stock: {row.item.quantity}{row.item.unit ? ` ${row.item.unit}` : ""}
                  {row.notes && ` · ${row.notes}`}
                </div>
              </div>
              <div className="text-lg font-bold tabular-nums">
                ×{row.quantity}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {can(session?.user.role, "location:delete") && (
        <div className="flex justify-end">
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Delete template?",
                description: "Future pick lists won't be able to use this template. Existing pick lists that were spawned from it are unaffected.",
                confirmText: "Delete template",
                variant: "destructive",
              });
              if (ok) del.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      )}
    </div>
  );
}
