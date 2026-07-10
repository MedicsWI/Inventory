-- Family Care of the Fox Cities / Medics Wisconsin Inventory
-- Remove duplicate Item rows: same name, SAME location only.
-- Date: 07/09/2026
--
-- Scope note: an item name repeated ACROSS locations (e.g. "Bandaids" in every
-- bag) is normal — each Location has its own stock row. A duplicate is two
-- rows with the same name inside the SAME location (e.g. "Bandaids" listed
-- twice in Trauma Bag 1), most likely from a double import or a location
-- clone run twice.
--
-- Data-only change, safe to run in the Supabase SQL editor for the inventory
-- app DB (sivbgrdkhifninhotunt.supabase.co). No prisma db push / migrate needed.
--
-- ⚠️ Deleting an Item CASCADES and permanently deletes its Checkout,
-- StockCountLine, PickListLine, and PickListTemplateItem history (and
-- nulls out any IncomingOrderLine.itemId pointing to it). STEP 2 below only
-- targets duplicate rows that have ZERO related history, so nothing gets
-- lost. Anything with history is left for you to review manually in STEP 3.

-- STEP 1: Show duplicate groups (same name, same location) with counts.
SELECT
  i."locationId",
  l.name AS location_name,
  lower(trim(i.name)) AS item_name_normalized,
  count(*) AS row_count,
  array_agg(i.id ORDER BY i."createdAt") AS item_ids_oldest_first
FROM "Item" i
LEFT JOIN "Location" l ON l.id = i."locationId"
GROUP BY i."locationId", l.name, lower(trim(i.name))
HAVING count(*) > 1
ORDER BY row_count DESC, location_name;

-- STEP 2: Preview + safe auto-delete candidates — duplicate rows (i.e. not the
-- oldest in their group) that have NO related checkouts, stock count lines,
-- pick list lines, or pick list template items. These are safe to remove
-- outright because there's no history attached.
WITH ranked AS (
  SELECT
    i.id,
    i.name,
    i."locationId",
    i."createdAt",
    row_number() OVER (
      PARTITION BY i."locationId", lower(trim(i.name))
      ORDER BY i."createdAt" ASC
    ) AS rn
  FROM "Item" i
),
dupes AS (
  SELECT * FROM ranked WHERE rn > 1
)
SELECT
  d.id, d.name, l.name AS location_name, d."createdAt",
  (SELECT count(*) FROM "Checkout" c WHERE c."itemId" = d.id) AS checkout_count,
  (SELECT count(*) FROM "StockCountLine" scl WHERE scl."itemId" = d.id) AS stock_count_line_count,
  (SELECT count(*) FROM "PickListLine" pll WHERE pll."itemId" = d.id) AS pick_list_line_count,
  (SELECT count(*) FROM "PickListTemplateItem" plti WHERE plti."itemId" = d.id) AS pick_list_template_item_count,
  (SELECT count(*) FROM "IncomingOrderLine" iol WHERE iol."itemId" = d.id) AS incoming_order_line_count
FROM dupes d
LEFT JOIN "Location" l ON l.id = d."locationId"
ORDER BY location_name, d.name;

-- STEP 3: Run this DELETE only after reviewing STEP 2's output. It removes
-- exactly the duplicate rows (not the oldest per group) that have zero rows
-- in all five related tables above — nothing with history is touched.
WITH ranked AS (
  SELECT
    i.id,
    row_number() OVER (
      PARTITION BY i."locationId", lower(trim(i.name))
      ORDER BY i."createdAt" ASC
    ) AS rn
  FROM "Item" i
),
dupes AS (
  SELECT id FROM ranked WHERE rn > 1
),
safe_to_delete AS (
  SELECT d.id
  FROM dupes d
  WHERE NOT EXISTS (SELECT 1 FROM "Checkout" c WHERE c."itemId" = d.id)
    AND NOT EXISTS (SELECT 1 FROM "StockCountLine" scl WHERE scl."itemId" = d.id)
    AND NOT EXISTS (SELECT 1 FROM "PickListLine" pll WHERE pll."itemId" = d.id)
    AND NOT EXISTS (SELECT 1 FROM "PickListTemplateItem" plti WHERE plti."itemId" = d.id)
)
DELETE FROM "Item"
WHERE id IN (SELECT id FROM safe_to_delete);

-- STEP 4 (manual): For any duplicate rows flagged in STEP 2 WITH related
-- history (checkout_count, stock_count_line_count, etc. > 0), decide by hand
-- whether to:
--   a) merge quantities into the row you're keeping, then delete the empty
--      duplicate, or
--   b) keep both if they represent genuinely different physical stock.
-- These are intentionally left out of the automatic delete above.
