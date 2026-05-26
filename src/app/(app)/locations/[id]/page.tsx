"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronLeft, Pencil, QrCode } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ItemCard, type ItemCardData } from "@/components/item-card";
import { BarcodeLabel } from "@/components/barcode-label";

type LocationDetail = {
  id: string;
  name: string;
  type: string;
  barcode: string | null;
  notes: string | null;
  parent: { id: string; name: string } | null;
  children: { id: string; name: string; type: string }[];
  items: ItemCardData[];
};

export default function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useQuery({
    queryKey: ["location", id],
    queryFn: () => api.get<LocationDetail>(`/api/locations/${id}`),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/locations"><ChevronLeft className="h-4 w-4" /> All locations</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="secondary">{data.type}</Badge>
          <h1 className="text-2xl font-bold mt-1">{data.name}</h1>
          {data.parent && (
            <div className="text-sm text-muted-foreground">
              Inside <Link href={`/locations/${data.parent.id}`} className="underline">{data.parent.name}</Link>
            </div>
          )}
        </div>
        <Button asChild variant="outline">
          <Link href={`/locations/${data.id}/edit`}>
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </Button>
      </header>

      {data.barcode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><QrCode className="h-4 w-4" /> Location barcode</CardTitle>
          </CardHeader>
          <CardContent>
            <BarcodeLabel value={data.barcode} title={data.name} subtitle={data.type} symbology="qrcode" />
          </CardContent>
        </Card>
      )}

      {data.children.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Sub-locations</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-2">
            {data.children.map((c) => (
              <Link key={c.id} href={`/locations/${c.id}`}
                className="rounded-md border p-3 hover:bg-accent flex items-center justify-between">
                <span className="font-medium">{c.name}</span>
                <Badge variant="outline">{c.type}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Items ({data.items.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.items.length === 0 && (
            <div className="text-sm text-muted-foreground">No items at this location.</div>
          )}
          {data.items.map((it) => <ItemCard key={it.id} item={it} />)}
        </CardContent>
      </Card>
    </div>
  );
}
