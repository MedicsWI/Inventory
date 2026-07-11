-- Product split — Phase A (07/11/2026)
-- Creates the Product master table and backfills it by deduping existing
-- CONSUMABLE items (returnable = false) on case-insensitive name.
-- Serialized returnable gear (AED-1..6, X-Series, radios) keeps productId NULL.
--
-- Run in the INVENTORY Supabase SQL editor (sivbgrdkhifninhotunt).
-- Safe to run once; re-running will error on the duplicate table (by design).
-- NO app behavior changes until Phase B ships — this is data-shape only.

-- 1. Product table (mirrors prisma/schema.prisma Product model)
create table "Product" (
  id            text primary key,
  name          text not null,
  description   text,
  sku           text,
  barcode       text unique,
  unit          text,
  "photoUrl"    text,
  returnable    boolean not null default false,
  "defaultLowStockThreshold" integer,
  "categoryId"  text references "Category"(id) on delete set null,
  "createdAt"   timestamp(3) not null default current_timestamp,
  "updatedAt"   timestamp(3) not null default current_timestamp
);
create index "Product_name_idx" on "Product"(name);
create index "Product_categoryId_idx" on "Product"("categoryId");

-- 2. Item.productId
alter table "Item" add column "productId" text references "Product"(id) on delete set null;
create index "Item_productId_idx" on "Item"("productId");

-- 3. Backfill: one product per distinct lower(name) among consumables.
--    Representative values (description/sku/unit/category/photo) come from any
--    row in the group that has them (first non-null).
with groups as (
  select
    lower(name)                                                          as key,
    min(name)                                                            as name,
    (array_agg(description) filter (where description is not null))[1]  as description,
    (array_agg(sku)         filter (where sku         is not null))[1]  as sku,
    (array_agg(unit)        filter (where unit        is not null))[1]  as unit,
    (array_agg("categoryId") filter (where "categoryId" is not null))[1] as category_id,
    (array_agg("photoUrl")  filter (where "photoUrl"  is not null))[1]  as photo_url,
    (array_agg("lowStockThreshold") filter (where "lowStockThreshold" is not null))[1] as threshold
  from "Item"
  where returnable = false
  group by lower(name)
)
insert into "Product"
  (id, name, description, sku, unit, "categoryId", "photoUrl", returnable, "defaultLowStockThreshold")
select gen_random_uuid()::text, name, description, sku, unit, category_id, photo_url, false, threshold
from groups;

-- 4. Link every consumable item to its product
update "Item" i
set "productId" = p.id
from "Product" p
where lower(i.name) = lower(p.name)
  and i.returnable = false;

-- 5. Sanity checks (run these, eyeball the numbers)
-- Distinct consumable names vs products created (should match):
select
  (select count(distinct lower(name)) from "Item" where returnable = false) as distinct_names,
  (select count(*) from "Product")                                          as products;
-- Consumables left unlinked (should be 0):
select count(*) as unlinked_consumables from "Item" where returnable = false and "productId" is null;
-- Biggest duplicate groups (your "TONS of duplicates" — now one product each):
select p.name, count(i.id) as stock_rows, sum(i.quantity) as total_qty
from "Product" p join "Item" i on i."productId" = p.id
group by p.name order by count(i.id) desc limit 20;
