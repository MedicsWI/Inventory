Drop your brand assets in this folder. They'll be served at the URL paths shown.

logo.png        →  /logo.png        (shown top-left of every page; 64x64 or larger square recommended)
favicon.ico     →  /favicon.ico     (browser tab icon)
apple-icon.png  →  /apple-icon.png  (iOS home-screen icon, 180x180)
manifest.webmanifest → /manifest.webmanifest (PWA install metadata)

The logo is fetched at runtime; if logo.png is missing the app falls back to
the placeholder "M" tile in the sidebar.
