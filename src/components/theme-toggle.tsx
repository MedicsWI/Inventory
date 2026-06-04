"use client";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

// 3-way theme control: System -> Light -> Dark -> System.
// The icon reflects the chosen setting (Monitor = follow system).
const ORDER = ["system", "light", "dark"] as const;
type Mode = (typeof ORDER)[number];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes can't know the user's theme until the client hydrates, so we
  // render a placeholder during SSR + first paint to avoid a hydration mismatch.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" disabled>
        <Sun className="h-5 w-5 opacity-0" />
      </Button>
    );
  }

  const current = (ORDER.includes(theme as Mode) ? theme : "system") as Mode;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  const Icon = current === "system" ? Monitor : current === "light" ? Sun : Moon;
  const label = `Theme: ${current}. Switch to ${next}.`;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );
}
