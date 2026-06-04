-- Family Care of the Fox Cities / Medics Wisconsin Inventory
-- Add Tile tracker link to inventory items.
-- Date: 06/04/2026
--
-- ⚠️ SHARED DATABASE — apply this MANUALLY, do NOT run `prisma db push` or
-- `prisma migrate` here. This Supabase project (dqlahfkhylnttmtcujon) also hosts
-- the ops hub tables (tile_devices, units, unit_locations, ...) which are NOT in
-- this Prisma schema. `prisma db push` reconciles the DB to the schema and can
-- DROP those ops-hub-owned tables. Run the statements below instead.
--
-- How to apply:
--   Supabase Dashboard → SQL Editor → paste & run, OR
--   psql "$DIRECT_URL" -f prisma/sql/2026-06-04_add_tile_device_id.sql
-- Then locally: npx prisma generate   (refreshes the Prisma client types)

-- Idempotent: safe to re-run.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "tile_device_id" TEXT;

-- One tracker maps to at most one item. Postgres allows multiple NULLs, so
-- items without a tracker are unaffected. Index name matches Prisma's default
-- so the schema stays in sync.
CREATE UNIQUE INDEX IF NOT EXISTS "Item_tile_device_id_key"
  ON "Item" ("tile_device_id");
