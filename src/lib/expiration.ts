// Expiration status helpers — drives 30/60/90 day color bands.

export type ExpiryStatus =
  | "expired"
  | "danger"   // <= 30 days
  | "warning"  // 31–60 days
  | "soon"     // 61–90 days
  | "ok"       // > 90 days
  | "none";    // no expiration set

export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function expiryStatus(date: Date | string | null | undefined): ExpiryStatus {
  const days = daysUntil(date);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= 30) return "danger";
  if (days <= 60) return "warning";
  if (days <= 90) return "soon";
  return "ok";
}

export function expiryLabel(date: Date | string | null | undefined): string {
  const days = daysUntil(date);
  if (days === null) return "No expiration";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `${days} days left`;
}
