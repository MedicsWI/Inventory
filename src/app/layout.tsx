import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Medics WI Inventory",
  description: "Field inventory management for Medics Wisconsin",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Medics WI",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning on body covers browser extensions that mutate
          form fields (Dashlane, 1Password, LastPass) and overlay extensions
          (color pickers, accessibility helpers) before React hydrates. */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
