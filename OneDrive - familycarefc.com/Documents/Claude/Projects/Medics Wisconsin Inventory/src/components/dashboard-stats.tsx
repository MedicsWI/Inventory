import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes, Clock, AlertTriangle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type Stat = {
  label: string;
  value: number;
  icon: typeof Boxes;
  href: string;
  danger?: boolean;
};

export function DashboardStats({
  totals,
}: {
  totals: { items: number; locations: number; expiringSoon: number; lowStock: number };
}) {
  const cards: Stat[] = [
    { label: "Items", value: totals.items, icon: Boxes, href: "/items" },
    { label: "Locations", value: totals.locations, icon: MapPin, href: "/locations" },
    {
      label: "Expiring ≤ 30d",
      value: totals.expiringSoon,
      icon: Clock,
      href: "/expiring",
      danger: totals.expiringSoon > 0,
    },
    {
      label: "Low stock",
      value: totals.lowStock,
      icon: AlertTriangle,
      href: "/low-stock",
      danger: totals.lowStock > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Link key={c.label} href={c.href} aria-label={`View ${c.label}`}>
          <Card className="transition-all active:scale-[0.98] hover:border-primary/50 cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                <c.icon className={cn("h-4 w-4", c.danger ? "text-danger" : "text-primary")} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", c.danger && "text-danger")}>{c.value}</div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
