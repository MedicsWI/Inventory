import { AppNav } from "@/components/app-nav";
import { MobileNav } from "@/components/mobile-nav";
import { GlobalSearch } from "@/components/global-search";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (Dashlane, color pickers, etc.)
    // inject DOM into the page before React hydrates. Harmless but noisy.
    <div className="flex min-h-screen" suppressHydrationWarning>
      <AppNav />
      <main className="flex-1 pb-24 md:pb-0">
        <div className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b">
          <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-2 flex items-center gap-3">
            <GlobalSearch />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl p-4 md:p-6">{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}
