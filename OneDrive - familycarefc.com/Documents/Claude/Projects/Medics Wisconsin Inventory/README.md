# Medics Wisconsin Inventory

A Sortly-style inventory system tuned for EMS field use: storage boxes, vehicles, stations, kits, items with expiration tracking and barcode/QR scanning. Runs as a Next.js 15 web app and ships natively to iOS + Android via Capacitor 6.

---

## Stack

- **Web**: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn-style UI
- **Mobile**: Capacitor 6 (ML Kit barcode scanning, Camera, Filesystem, Push/Local Notifications, Preferences)
- **Auth**: Auth.js v5 (NextAuth) — Credentials + optional Google
- **DB**: Supabase Postgres via Prisma 5
- **State**: TanStack Query (server cache) + Zustand (light client state)
- **Scanning**: `html5-qrcode` on web, `@capacitor-mlkit/barcode-scanning` on native
- **Labels**: `bwip-js` for printable QR / Code128

## Project layout

```
medics-wi-inventory/
├── prisma/             schema.prisma, seed.ts
├── src/
│   ├── app/
│   │   ├── (app)/      authed app shell: dashboard, locations, items, scan, expiring, activity, admin
│   │   ├── login/      sign-in
│   │   ├── api/        items, locations, categories, scan, activity, dashboard, auth
│   │   ├── layout.tsx  root layout + providers
│   │   └── globals.css design tokens
│   ├── components/
│   │   ├── ui/         button, card, input, badge, label, textarea, separator
│   │   ├── app-nav.tsx, mobile-nav.tsx, theme-toggle.tsx
│   │   ├── barcode-scanner.tsx, barcode-label.tsx
│   │   ├── location-tree.tsx, item-card.tsx, expiration-badge.tsx
│   │   └── dashboard-stats.tsx
│   ├── lib/            prisma, auth, utils, expiration, permissions, api-client, activity
│   └── middleware.ts   route protection
├── capacitor.config.ts
├── next.config.mjs, tailwind.config.ts, tsconfig.json
├── package.json, .env.example, .gitignore
└── README.md
```

---

## 1. First-time setup

Requires Node 20+, pnpm 9+, and a Supabase project.

```bash
pnpm install
cp .env.example .env
# Edit .env — fill in Supabase URLs, NEXTAUTH_SECRET (openssl rand -base64 32)
pnpm db:generate
pnpm db:push       # creates tables from schema.prisma
pnpm db:seed       # creates an admin user, sample categories/locations/items
pnpm dev
```

Default seed admin (override via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`):

- email: `admin@medicswi.local`
- password: `ChangeMe!123`

**Change the password immediately.**

### Supabase setup

1. Create a project at supabase.com.
2. Project Settings → Database → Connection string. Use the **pooler** connection string (port 6543) for `DATABASE_URL` and the **direct** connection (port 5432) for `DIRECT_URL`. Both go in `.env`.
3. (Optional) Supabase Storage bucket called `inventory-photos` if you want to use the `photoUrl` fields for item / location photos. You can swap to S3 later — the schema just stores a URL.

### Google SSO (optional)

Fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Set the redirect URI to `https://YOUR_DOMAIN/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for local dev). Set `NEXT_PUBLIC_GOOGLE_ENABLED=1` to show the button on the login page.

---

## 2. Roles

| Role    | Read | Adjust qty | Create/Edit items | Manage locations | Manage users |
|---------|------|------------|-------------------|------------------|--------------|
| MEDIC   | yes  | yes        | no                | no               | no           |
| MANAGER | yes  | yes        | yes               | yes              | no           |
| ADMIN   | yes  | yes        | yes               | yes              | yes          |

Full matrix lives in `src/lib/permissions.ts`.

---

## 3. Mobile build (Capacitor)

The mobile app reuses the same Next.js codebase via a static export.

### Prereqs

- Android: Android Studio + JDK 17
- iOS: macOS + Xcode 15+ + CocoaPods

### Add platforms (first time only)

```bash
CAP_BUILD=1 pnpm build         # static export to ./out
pnpm exec cap add android
pnpm exec cap add ios
```

### Iterate

```bash
pnpm cap:android     # builds, syncs, opens Android Studio
pnpm cap:ios         # builds, syncs, opens Xcode
```

Under the hood: `next build` writes to `./out`, then `cap sync` copies that into `android/app/src/main/assets/public` and `ios/App/App/public`.

### Required native permissions

Already configured via the plugins, but verify in the platform projects:

**Android** (`android/app/src/main/AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**iOS** (`ios/App/App/Info.plist`):
```xml
<key>NSCameraUsageDescription</key>
<string>Used to scan barcodes and QR codes on inventory items.</string>
```

### Set the API endpoint for native builds

When the mobile app loads from the bundle (offline-capable shell), it still needs to reach your API. Set this in `.env` **before** the static build:

```
NEXT_PUBLIC_API_BASE_URL=https://inventory.medicswi.com
```

---

## 4. Scanning guide

The Scan tab (`/scan`) opens the device camera and recognizes:

- **QR codes** — what we use on storage bins, kits, vehicles
- **Code 128 / EAN-13 / UPC-A** — manufacturer barcodes on supplies

Flow:

1. Tap **Scan** in the bottom nav.
2. Tap **Start camera**.
3. Align the code in the box. The app navigates straight to the matching item or location detail page.
4. Unknown codes show a toast — you can then create the item and assign that barcode from the item form.

On native (iOS/Android) the app uses ML Kit (fast, works offline). On the web it uses `html5-qrcode` (needs HTTPS or `localhost`).

### Printing labels

Open any item or location with a barcode → expand the **Label** card → **Print label**. Uses `bwip-js` to generate a QR (default) or Code 128. Pair with a Brother QL-style label printer for the field.

---

## 5. Bulk import (items)

Designed around CSV. Columns:

```
name, barcode, sku, quantity, unit, lotNumber, expirationDate (YYYY-MM-DD), lowStockThreshold, locationName, categoryName, notes
```

Open **Admin → CSV import**. The page lets you download a template, upload a CSV, preview the first 20 rows, and import. Rules:

- Matches existing items by **barcode** (upsert). Rows without a barcode are always created.
- **locationName** must match an existing location exactly (case-insensitive) — protects you from creating duplicate locations by typo.
- **categoryName** is auto-created if it doesn't exist.
- Per-row errors are reported in the result panel; good rows still get imported.

## 5b. Photo uploads (Supabase Storage)

The item form has a "Take or upload photo" button. Photos are uploaded through `/api/upload` to a Supabase Storage bucket. To enable:

1. In Supabase → **Storage** → **New bucket** → name it `inventory-photos` → set it to **Public** (or private + signed URLs — we use public URLs by default for simplicity).
2. In Project Settings → API, copy the **Project URL** and **service_role** key.
3. Add to `.env`:
   ```
   NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="eyJh..."
   SUPABASE_STORAGE_BUCKET="inventory-photos"
   ```
4. Restart `pnpm dev`.

The service-role key bypasses RLS — keep it server-side only. Never expose it via `NEXT_PUBLIC_*`. On native Capacitor builds, switch the picker to `@capacitor/camera` for true device-camera capture (it already routes through `/api/upload`).

---

## 6. Notifications

Three channels:

- **In-app** — always on. Bell icon and `/notifications` page.
- **Email** (Microsoft 365 SMTP) — opt-in per user.
- **Microsoft Teams webhook** — opt-in per user; fires to one configured channel.

Future channels (when mobile build lands): local + push notifications via Capacitor plugins.

### 6a. Microsoft 365 email setup

1. Pick or create the sending mailbox. Recommended: a dedicated service account like `inventory-alerts@medicswisconsin.com`.
2. **Enable SMTP AUTH** on the mailbox: M365 admin center → Active users → click the user → **Mail** tab → **Manage email apps** → check **Authenticated SMTP**.
3. The sending account needs **MFA disabled** OR you need to generate an **app password**: portal.office.com → My account → Security info → Add sign-in method → App password. Save the 16-character password.
4. Edit `.env`:
   ```
   SMTP_HOST="smtp.office365.com"
   SMTP_PORT="587"
   SMTP_USER="inventory-alerts@medicswisconsin.com"
   SMTP_PASSWORD="<the app password>"
   SMTP_FROM="Medics WI Inventory <inventory-alerts@medicswisconsin.com>"
   ```
5. Restart `pnpm dev`.
6. As admin → **Admin → Integrations** → Email card → **Send test email to me** → confirm it lands.

### 6b. Microsoft Teams webhook setup

The classic "Incoming Webhook" connector is being retired by Microsoft. The new path is via **Workflows**:

1. In Teams, open the destination channel (e.g. **Inventory alerts**).
2. Channel menu (⋯) → **Workflows**.
3. Search for the template **"Post to a channel when a webhook request is received"**.
4. Click **Next** → confirm the team + channel → **Add workflow**.
5. Teams shows you the **webhook URL** — copy it.
6. Edit `.env`:
   ```
   TEAMS_WEBHOOK_URL="<the URL from Teams>"
   ```
7. Restart `pnpm dev`.
8. **Admin → Integrations** → Teams card → **Send test post** → confirm it shows up in the channel.

### 6c. User opt-in

Once a channel is configured, each admin/manager picks their channels at **Alert settings** in the sidebar (toggles for In-app, Email, Teams).

### 6d. Sending the alerts

For now, alerts are generated on demand: click **Check now** on `/notifications`. When the app is deployed, wire **Vercel Cron** to `POST /api/notifications/check` daily — that's all it takes for automated alerts.

---

## 7. Deployment

### Web (Vercel — recommended)

1. Push to GitHub.
2. Import the repo in Vercel.
3. Set env vars: `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, optional Google keys.
4. Build command: `prisma generate && next build`. Vercel auto-detects Next.js.
5. (Optional) Vercel Cron → `GET /api/cron/expirations` (add a small route that queries items expiring in 30/60/90 days and writes Notification rows).

### Mobile

- **Android**: Generate a signed AAB in Android Studio → upload to Play Console internal testing.
- **iOS**: Archive in Xcode → distribute via TestFlight.

---

## 8. Useful scripts

```bash
pnpm dev            # next dev
pnpm build          # next build
pnpm typecheck      # tsc --noEmit
pnpm lint           # next lint
pnpm db:studio      # Prisma Studio (browse DB)
pnpm db:migrate     # create + apply a migration
pnpm db:push        # push schema without migrations (good for dev)
pnpm db:seed        # seed sample data
pnpm cap:sync       # static export + cap sync
```

---

## 9. Security + ops notes

- **Sessions** are JWT (`session.strategy = "jwt"`) so mobile + edge functions work without a session table read on every request. Role is baked into the token; reissue via re-login after a role change.
- **Activity log** captures `CREATE / UPDATE / DELETE / MOVE / SCAN / ADJUST_QTY`. Don't disable — it's the audit trail.
- **PHI**: this app stores supply data, not patient data, but treat user identifiers carefully. Do not log raw passwords or session tokens.
- **Expiration math**: status bands live in `src/lib/expiration.ts` — change them in one place.
- **Glove-friendly UI**: minimum 48px tap targets enforced in Tailwind config + buttons.

---

## 10. Roadmap (intentionally left for follow-up)

- Drag-and-drop reparenting in `/locations` (current model already supports the move via PATCH `parentId`).
- Photo capture + upload to Supabase Storage from `/items/new`.
- Offline queue with `@capacitor/preferences` — buffer quantity adjustments and replay when online.
- CSV import UI under `/admin`.
- Daily expirations cron + push notifications.
- Admin users page (invite, role change, deactivate).
