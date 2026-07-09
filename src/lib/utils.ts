import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  // MM/DD/YYYY per Brian's preference
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// For DATE-ONLY fields (expiration, need-by, expected return) stored as UTC
// midnight: render in UTC. Rendering them in local time shifts the day back
// (07/04 stored → "07/03" shown in America/Chicago). Real timestamps
// (checkedOutAt, createdAt, …) should keep using formatDate.
export function formatDateOnly(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Human-friendly verbs for activity log entries
export function actionLabel(action: string): string {
  switch (action) {
    case "CREATE": return "added";
    case "UPDATE": return "updated";
    case "DELETE": return "deleted";
    case "MOVE": return "moved";
    case "SCAN": return "scanned";
    case "ADJUST_QTY": return "adjusted qty for";
    case "LOGIN": return "logged in";
    case "LOGOUT": return "logged out";
    default: return action.toLowerCase();
  }
}
