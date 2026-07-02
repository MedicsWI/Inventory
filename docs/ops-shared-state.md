# Medics Wisconsin — Cross-App Shared State

This file is the source of truth for context shared between the Ops Hub and Inventory App.
Read this at the start of any Cowork session on either repo.

## Supabase

- **Ops Hub DB**: `dqlahfkhylnttmtcujon.supabase.co`
- **Inventory App DB**: `sivbgrdkhifninhotunt.supabase.co` — SEPARATE project from ops hub
- The two apps were originally on the same DB (PascalCase Inventory tables visible in ops hub advisor), but confirm before running any cross-app SQL.

## Shared-DB Hazard

The ops hub manages its own tables via raw SQL migrations (not Prisma).
The inventory app manages its tables via `prisma db push` or `prisma migrate`.

**Never run `prisma db push` against the shared DB without confirming it won't touch ops hub tables.**
The ops hub tables (`units`, `unit_locations`, `tile_devices`, `users`, `volunteers`, etc.) are NOT in the Prisma schema — `db push` can drop them.

Safe pattern: write a raw SQL `alter table` script and run it in the Supabase SQL editor. Do NOT use `prisma db push` for additive column changes on a shared DB.

## Tile Tracker Integration (added 06/03/2026)

### Ops Hub side (already built)
- `unit_locations` table: stores real-time GPS for both phone GPS (`source='phone'`) and Tile trackers (`source='tile'`).
- `tile_devices` table: registry mapping `tile_device_id` → human label, optional `unit_id` (ops hub unit), optional `inventory_item_id` (text ref to inventory app item).
- Tile sync: Vercel cron at `/api/tile/sync` runs every 5 min, authenticates with Tile Pro API, upserts locations.
- Admin UI: `/admin/tile-devices` — register devices, assign labels, link to units and inventory items.
- Live map: shows Tile tracker dots (clustered when stacked), separate toggle from staff GPS dots.

### Inventory App side (work in progress)
- Goal: add `tile_device_id text unique` to the `Item` model so a physical asset (AED, cart, bag) can be linked to its Tile tracker.
- Prisma field added: `tileDeviceId String? @unique @map("tile_device_id")`
- SQL to apply: `alter table "Item" add column if not exists tile_device_id text unique;`
  Run in whichever Supabase project the inventory app uses (confirm the DB URL first).
- Once applied, run `npx prisma generate` in `~/medics-wi-inventory`.

### How the link works end-to-end
1. Inventory item has `tile_device_id = "abc-123"`
2. Ops hub `tile_devices` table has a row with `tile_device_id = "abc-123"` and `inventory_item_id = "{inventory item id}"`
3. Live map shows the tracker with its registered label
4. Clicking the tracker can link to `inventory.medicswisconsin.com/items/{id}`

### Done (06/04/2026)
- [x] Confirmed inventory Supabase project: `sivbgrdkhifninhotunt.supabase.co` (separate from ops hub)
- [x] `tile_device_id text` column + `Item_tile_device_id_key` unique index applied in inventory DB
- [x] `prisma generate` runs on every Vercel build (`build` = `prisma generate && next build`); deployed
- [x] Committed (95f498d feat, 27f7a7a docs) and deployed
- [x] Inventory items created (returnable, `tile_device_id` null until linked):
  - AED 1-6 → category **AED** (barcodes AED-1..6)
  - X-Series 1-4 → category **Cardiac Monitors** (barcodes XSERIES-1..4; Zoll X Series = full monitor/defibs)
  - SQL: `prisma/sql/2026-06-04_seed_defib_assets.sql`, `prisma/sql/2026-06-04_split_defib_categories.sql`

### Done (07/01/2026)
- [x] Batteries swapped in all 27 Tiles
- [x] Inventory app bulk-link page built: `/admin/tile-links` — lists all returnable items with inline `tile_device_id` field (unique-violation toast on duplicate paste). `/api/items?returnable=1` filter added.

### Still to do
- [x] Register all 27 Tile devices at `/admin/tile-devices` in the ops hub (done 07/01/2026)
- [ ] Paste each device ID into inventory `/admin/tile-links` (AED-1..6, XSERIES-1..4, etc.)
- [ ] Set `inventory_item_id` on the matching ops hub `tile_devices` row so the live map click-through works

## Handoff → Ops Hub: Volunteer License Verify Queue (added 07/01/2026)

The inventory app's volunteer feature was deleted in Phase 8 before this shipped.
Build it in the ops hub against its volunteers tables. Spec (from the inventory
prototype, reviewed by Brian):

- Page: `/volunteers/verify` (or ops hub equivalent) — all volunteers with
  `cred_verified = false`, searchable by name/email.
- Columns: name (link to record) + email, type badge (MEDICAL/SECURITY), state,
  ID-photo link (opens in new tab), then INLINE editable: cred level select
  (EMR/EMT/AEMT/PARAMEDIC/RN/LPN/MD/DO/PA/NP/SECURITY/POLICE/FIRE/CHAPLAIN/OTHER),
  license # input, expiration date input.
- Row actions: **Verify** (saves fields + sets verified, stamps verifier user id +
  timestamp, row drops off the queue; disabled until a level is picked) and
  **Save** (fields only, stays in queue).
- Unverify must NULL the verifier/timestamp stamp (the old inventory PATCH had a
  bug: it passed `undefined`, which is a no-op — don't copy that).
- Link the queue from wherever the "needs verification" count shows.

## Phase 8 Decommission (07/01/2026)

Inventory app: deleted all moved code — `/api/{events,volunteers,alerts,alert-subscribers,twilio,event-templates}`, `/api/me/alerts`, UI pages `(app)/{events,volunteers,event-templates,alert-groups,account}`, public kiosk `app/events`, components `event-template-form`/`event-gear-dialog`/`push-toggle`, `lib/ops-hub-auth`. Middleware MOVED lists retained as friendly 503/redirect pointers. Prisma models for the old tables intentionally kept (data preserved; and removing them would make `prisma db push`/`migrate` want to drop tables — don't).

## Key Context

- **Ops Hub URL**: https://ops.medicswisconsin.com
- **Ops Hub Repo**: https://github.com/MedicsWI/medics-wi-operations-hub
- **Inventory App URL**: https://inventory.medicswisconsin.com
- **Inventory Repo**: https://github.com/MedicsWI/Inventory

## Session Recovery

Memory files live in the ops hub session space and are NOT readable from other Cowork sessions.
To recover ops hub context in a new session: ask Claude to "pull context from the ops hub session transcripts."
This file is the preferred shared-state mechanism — update it when cross-app changes are made.
