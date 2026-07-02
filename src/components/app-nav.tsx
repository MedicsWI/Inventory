"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Boxes,
  FolderTree,
  ScanLine,
  Clock,
  Activity,
  Settings,
  LogOut,
  PackageOpen,
  PackageCheck,
  Bell,
  BarChart3,
  AlertTriangle,
  ClipboardCheck,
  Truck,
  ListChecks,
  CalendarDays,
  QrCode,
  Briefcase,
  ExternalLink,
  Users,
  Package,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";

type NavItem = { href: string; label: string; icon: typeof Boxes };

// Section accents map to the Medics WI UI Color Guide:
//   Daily      → cyan       (the always-on hub)
//   Inventory  → sky        (items + locations live here)
//   Workflow   → violet     (events / labels / picks / counts / receiving)
//   Status     → amber      (warnings — expiring / low stock)
//   Insights   → slate      (reports / activity)
//   Admin      → red        (gated, settings, all-events views)
type Group = {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
  // Tailwind classes for the dot + title tint.
  dot: string;
  text: string;
};

const groups: Group[] = [
  {
    title: "Daily",
    dot: "bg-cyan-400",
    text: "text-cyan-300",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/scan", label: "Scan", icon: ScanLine },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Inventory",
    dot: "bg-sky-400",
    text: "text-sky-300",
    items: [
      { href: "/items", label: "Items", icon: Boxes },
      { href: "/locations", label: "Locations", icon: FolderTree },
      { href: "/checkouts", label: "My checkouts", icon: PackageOpen },
    ],
  },
  {
    title: "Workflow",
    dot: "bg-violet-400",
    text: "text-violet-300",
    items: [
      // /events moved to Ops Hub on 05/27/2026 (Phase 7 cutover).
      { href: "/labels", label: "QR labels", icon: QrCode },
      { href: "/pick-lists", label: "Pick lists", icon: ListChecks },
      { href: "/stock-counts", label: "Stock counts", icon: ClipboardCheck },
      { href: "/orders", label: "Incoming orders", icon: Truck },
    ],
  },
  {
    title: "Alerts & Status",
    dot: "bg-amber-400",
    text: "text-amber-300",
    items: [
      { href: "/expiring", label: "Expiring", icon: Clock },
      { href: "/low-stock", label: "Low stock", icon: AlertTriangle },
    ],
  },
  {
    title: "Insights",
    dot: "bg-slate-400",
    text: "text-slate-300",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/activity", label: "Activity log", icon: Activity },
    ],
  },
  {
    title: "Administration",
    dot: "bg-red-400",
    text: "text-red-300",
    adminOnly: true,
    items: [
      // /volunteers + /alert-groups moved to Ops Hub on 05/27/2026 (Phase 7 cutover).
      { href: "/admin/checkouts", label: "All checkouts", icon: PackageCheck },
      { href: "/admin", label: "Settings & users", icon: Settings },
    ],
  },
];

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN" || session?.user.role === "MANAGER";

  return (
    <aside
      className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-border md:bg-card"
      suppressHydrationWarning
    >
      {/* Brand header — matches Ops Hub badge pattern */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="h-9 w-9 rounded-lg bg-brand-cyan/20 grid place-items-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Medics Wisconsin"
            className="h-7 w-7 rounded-md object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "block");
            }}
          />
          <Package className="h-5 w-5 text-brand-cyan" style={{ display: "none" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight truncate">Medics Wisconsin</div>
          <div className="text-xs text-muted-foreground leading-tight">Inventory</div>
        </div>
        <NotificationBell />
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {groups.map((group, idx) => {
          if (group.adminOnly && !isAdmin) return null;
          const isFirst = idx === 0;
          return (
            <div
              key={group.title}
              className={cn(
                "space-y-1",
                !isFirst && "pt-3 mt-2 border-t border-border/40",
              )}
            >
              <div
                className={cn(
                  "px-3 pt-1 pb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider",
                  group.text,
                )}
              >
                <span className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", group.dot)} />
                <span>{group.title}</span>
              </div>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href ||
                  (href !== "/admin" && pathname.startsWith(href + "/")) ||
                  // /admin should only highlight exact and /admin/import (not /admin/checkouts which has its own row)
                  (href === "/admin" && (pathname === "/admin" || pathname.startsWith("/admin/import") || pathname.startsWith("/admin/export") || pathname.startsWith("/admin/integrations")));
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-foreground/85 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Cross-link to Operations Hub — only renders when NEXT_PUBLIC_OPSHUB_URL is set,
          so we can ship Operations Hub independently and turn this on by adding the env var. */}
      {process.env.NEXT_PUBLIC_OPSHUB_URL && (
        <div className="border-t border-border/40 px-3 py-2">
          <a
            href={process.env.NEXT_PUBLIC_OPSHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <Briefcase className="h-4 w-4 text-brand-cyan" />
            <span className="flex-1">Operations Hub</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Footer: account actions + theme + sign out */}
      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs min-w-0">
            <div className="font-medium truncate">{session?.user.name ?? session?.user.email}</div>
            <div className="text-muted-foreground">{session?.user.role}</div>
          </div>
          <ThemeToggle />
        </div>
        {/* /account/alerts moved to Ops Hub on 05/27/2026 (Phase 7 cutover). */}
        {/* Password change removed 07/01/2026 — sign-in is Entra SSO / magic link only. */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
