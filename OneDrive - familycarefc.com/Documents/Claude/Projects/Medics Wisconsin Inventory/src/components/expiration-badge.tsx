import { Badge } from "@/components/ui/badge";
import { expiryStatus, expiryLabel } from "@/lib/expiration";

const variantMap = {
  expired: "destructive",
  danger: "danger",
  warning: "warn",
  soon: "warn",
  ok: "ok",
  none: "outline",
} as const;

export function ExpirationBadge({ date }: { date: Date | string | null | undefined }) {
  const status = expiryStatus(date);
  if (status === "none") {
    return <Badge variant="outline">No exp.</Badge>;
  }
  return <Badge variant={variantMap[status]}>{expiryLabel(date)}</Badge>;
}
