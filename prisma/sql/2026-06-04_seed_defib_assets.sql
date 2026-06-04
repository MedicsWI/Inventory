-- Family Care of the Fox Cities / Medics Wisconsin Inventory
-- Seed defibrillator assets: AED x6, Zoll X-Series x4
-- Run in the INVENTORY Supabase SQL editor (sivbgrdkhifninhotunt). Idempotent (re-runnable).
-- Date: 06/04/2026
--
-- Assumptions (change & tell me if wrong):
--  * Single category "Defibrillators" (reused if it already exists).
--  * No location assigned yet (locationId NULL) — assign each unit in-app.
--  * returnable = true (equipment, shows in borrow/return; no low-stock alerts).
--  * tile_device_id NULL — link each unit after registering trackers in the ops hub.
--  * Scannable barcodes AED-1..6 / XSERIES-1..4; conflict guard is on barcode.
-- No `prisma generate` needed — this is data only, not a schema change.

-- 1. Category (reuses existing row if one named 'Defibrillators' already exists)
insert into "Category" (id, name, color, "createdAt")
values ('clmedcatdefib00000000001', 'Defibrillators', '#ef4444', now())
on conflict (name) do nothing;

-- 2. Items — one row per physical unit
insert into "Item" (id, name, barcode, quantity, unit, returnable, "categoryId", "createdAt", "updatedAt")
values
  ('clmedaed0000000000000001', 'AED 1',      'AED-1',     1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now()),
  ('clmedaed0000000000000002', 'AED 2',      'AED-2',     1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now()),
  ('clmedaed0000000000000003', 'AED 3',      'AED-3',     1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now()),
  ('clmedaed0000000000000004', 'AED 4',      'AED-4',     1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now()),
  ('clmedaed0000000000000005', 'AED 5',      'AED-5',     1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now()),
  ('clmedaed0000000000000006', 'AED 6',      'AED-6',     1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now()),
  ('clmedxs00000000000000001', 'X-Series 1', 'XSERIES-1', 1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now()),
  ('clmedxs00000000000000002', 'X-Series 2', 'XSERIES-2', 1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now()),
  ('clmedxs00000000000000003', 'X-Series 3', 'XSERIES-3', 1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now()),
  ('clmedxs00000000000000004', 'X-Series 4', 'XSERIES-4', 1, 'each', true, (select id from "Category" where name = 'Defibrillators'), now(), now())
on conflict (barcode) do nothing;

-- 3. Verify
select id, name, barcode, returnable, "categoryId", tile_device_id
from "Item"
where barcode in ('AED-1','AED-2','AED-3','AED-4','AED-5','AED-6',
                  'XSERIES-1','XSERIES-2','XSERIES-3','XSERIES-4')
order by name;
