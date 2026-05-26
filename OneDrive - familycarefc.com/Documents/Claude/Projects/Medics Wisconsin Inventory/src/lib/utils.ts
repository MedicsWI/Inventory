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
