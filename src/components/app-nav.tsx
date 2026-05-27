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
  KeyRound,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";

type NavItem = { href: string; label: string; icon: typeof Boxes };

// Grouped to match real usage patterns:
//   1. Daily — overview + the high-frequency action
//   2. Inventory — the data you're managing
//   3. Status — alerts that need your eye
//   4. Insights — historical / analytical views
//   5. Admin — gated to ADMIN/MANAGER
const groups: { title: string; items: NavItem[]; adminOnly?: boolean }[] = [
  {
    title: "Daily",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/scan", label: "Scan", icon: ScanLine },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Inventory",
    items: [
      { href: "/items", label: "Items", icon: Boxes },
      { href: "/locations", label: "Locations", icon: FolderTree },
      { href: "/checkouts", label: "My checkouts", icon: PackageOpen },
    ],
  },
  {
    title: "Workflow",
    items: [
      { href: "/events", label: "Events", icon: CalendarDays },
      { href: "/labels", label: "QR labels", icon: QrCode },
      { href: "/pick-lists", label: "Pick lists", icon: ListChecks },
      { href: "/stock-counts", label: "Stock counts", icon: ClipboardCheck },
      { href: "/orders", label: "Incoming orders", icon: Truck },
    ],
  },
  {
    title: "Status",
    items: [
      { href: "/expiring", label: "Expiring", icon: Clock },
      { href: "/low-stock", label: "Low stock", icon: AlertTriangle },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/activity", label: "Activity log", icon: Activity },
    ],
  },
  {
    title: "Admin",
    adminOnly: true,
    items: [
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
      className="hidden md:flex md:w-64 md:flex-col md:border-r md:bg-card"
      suppressHydrationWarning
    >
      {/* Brand header */}
      <div className="flex h-16 items-center gap-2 border-b px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Medics Wisconsin"
          className="h-8 w-8 rounded-md object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
            (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "grid");
          }}
        />
        <div
          className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold"
          style={{ display: "none" }}
        >
          M
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold leading-tight">Medics WI</div>
          <div className="text-xs text-muted-foreground">Inventory</div>
        </div>
        <NotificationBell />
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {groups.map((group) => {
          if (group.adminOnly && !isAdmin) return null;
          return (
            <div key={group.title} className="space-y-1">
              <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
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
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
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
        <div className="border-t px-3 py-2">
          <a
            href={process.env.NEXT_PUBLIC_OPSHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground"
          >
            <Briefcase className="h-4 w-4" />
            <span className="flex-1">Operations Hub</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Footer: account actions + theme + sign out */}
      <div className="border-t p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs min-w-0">
            <div className="font-medium truncate">{session?.user.name ?? session?.user.email}</div>
            <div className="text-muted-foreground">{session?.user.role}</div>
          </div>
          <ThemeToggle />
        </div>
        <Button asChild variant="ghost" className="w-full justify-start mb-1">
          <Link href="/account/alerts">
            <Bell className="h-4 w-4" /> Alert settings
          </Link>
        </Button>
        <Button asChild variant="ghost" className="w-full justify-start mb-1">
          <Link href="/account/password">
            <KeyRound className="h-4 w-4" /> Change password
          </Link>
        </Button>
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
