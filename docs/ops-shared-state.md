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

### Still to do
- [ ] Confirm inventory app Supabase project URL (`cat ~/medics-wi-inventory/.env.local | grep SUPABASE`)
- [ ] Run `alter table "Item"` SQL in the correct Supabase
- [ ] Run `npx prisma generate` in `~/medics-wi-inventory`
- [ ] Commit and deploy inventory app changes
- [ ] After battery swap: register all 27 Tile devices at `/admin/tile-devices` in the ops hub
- [ ] Link registered devices to inventory items once inventory items are created

## Key Context

- **Ops Hub URL**: https://ops.medicswisconsin.com
- **Ops Hub Repo**: https://github.com/MedicsWI/medics-wi-operations-hub
- **Inventory App URL**: https://inventory.medicswisconsin.com
- **Inventory Repo**: https://github.com/MedicsWI/Inventory

## Session Recovery

Memory files live in the ops hub session space and are NOT readable from other Cowork sessions.
To recover ops hub context in a new session: ask Claude to "pull context from the ops hub session transcripts."
This file is the preferred shared-state mechanism — update it when cross-app changes are made.
