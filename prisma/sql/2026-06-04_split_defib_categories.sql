-- Family Care of the Fox Cities / Medics Wisconsin Inventory
-- Split defibrillator assets into two categories: AED (AED 1-6) and Cardiac Monitors (X-Series 1-4).
-- X-Series (Zoll X Series) are full monitor/defibrillators, not AEDs.
-- Run in the INVENTORY Supabase SQL editor (sivbgrdkhifninhotunt). Idempotent.
-- Date: 06/04/2026

-- 1. Rename existing category 'Defibrillators' -> 'AED' (now holds only the AEDs)
update "Category" set name = 'AED' where id = 'clmedcatdefib00000000001';

-- 2. New category for the X-Series full monitor/defibrillators
insert into "Category" (id, name, color, "createdAt")
values ('clmedcatmonitor000000001', 'Cardiac Monitors', '#6366f1', now())
on conflict (name) do nothing;

-- 3. Move the 4 X-Series into Cardiac Monitors
update "Item"
set "categoryId" = (select id from "Category" where name = 'Cardiac Monitors'),
    "updatedAt"  = now()
where barcode in ('XSERIES-1','XSERIES-2','XSERIES-3','XSERIES-4');

-- 4. Verify
select i.name, i.barcode, c.name as category
from "Item" i join "Category" c on c.id = i."categoryId"
where i.barcode like 'AED-%' or i.barcode like 'XSERIES-%'
order by c.name, i.name;
