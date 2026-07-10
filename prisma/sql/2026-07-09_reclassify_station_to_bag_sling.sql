-- Family Care of the Fox Cities / Medics Wisconsin Inventory
-- Bulk-reclassify Location rows: type STATION -> BAG where name contains "sling".
-- Date: 07/09/2026
--
-- This is a data UPDATE only (no schema change), safe to run directly in the
-- Supabase SQL editor for the inventory app DB (sivbgrdkhifninhotunt.supabase.co).
-- No prisma db push / migrate needed — no column or table changes.

-- STEP 1: Preview affected rows before making any changes. Run this first and
-- review the list.
SELECT id, name, type, barcode
FROM "Location"
WHERE type = 'STATION'
  AND name ILIKE '%sling%'
ORDER BY name;

-- STEP 2: Apply the reclassification. Only run after confirming the preview
-- above looks correct.
UPDATE "Location"
SET type = 'BAG',
    "updatedAt" = now()
WHERE type = 'STATION'
  AND name ILIKE '%sling%';

-- STEP 3 (optional): Verify the update.
SELECT id, name, type, barcode
FROM "Location"
WHERE name ILIKE '%sling%'
ORDER BY name;
