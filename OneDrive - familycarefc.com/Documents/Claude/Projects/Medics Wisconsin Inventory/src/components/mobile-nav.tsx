"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Boxes, ScanLine, Clock, FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/locations", label: "Locations", icon: FolderTree },
  { href: "/scan", label: "Scan", icon: ScanLine, prominent: true },
  { href: "/items", label: "Items", icon: Boxes },
  { href: "/expiring", label: "Expiring", icon: Clock },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ href, label, icon: Icon, prominent }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 text-xs",
                  "min-h-tap",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full",
                    prominent ? "bg-primary text-primary-foreground shadow-lg" : "",
                  )}
                >
                  <Icon className={cn("h-5 w-5", prominent && "h-6 w-6")} />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
