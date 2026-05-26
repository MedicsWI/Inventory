"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export function NotificationBell() {
  // Poll every 60s for unread count
  const { data } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => api.get<{ unreadCount: number }>("/api/notifications?unread=1"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const count = data?.unreadCount ?? 0;
  return (
    <Button asChild variant="ghost" size="icon" className="relative" aria-label="Notifications">
      <Link href="/notifications">
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-danger text-[10px] font-bold text-white px-1">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
