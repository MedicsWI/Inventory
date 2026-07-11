# Product Split — Master Items with Per-Location Stock

Approved by Brian 07/10/2026 ("Full split"). Phase A shipped 07/11/2026.

## Problem

The same consumable ("Gauze 4x4") exists as separate Item rows in every bag/box
that stocks it — TONS of visible duplicates, per-copy edits, per-copy alert
thresholds, and no total-on-hand view.

## Design

Two classes of things, one new table:

- **Product** (new) — the master: name, description, SKU, manufacturer UPC/NDC
  (`barcode`, unique), unit, photo, category, default alert threshold.
- **Item** (existing, unchanged FKs) — becomes "stock of a product at a
  location": quantity, location, lot, expiration, per-location threshold
  override, label barcode (asset codes like `AED-1`), Tile link. Gains nullable
  `productId`.
- **Serialized returnable gear** (AEDs, monitors, radios) keeps one Item per
  physical unit — per-unit barcode + Tile tracker — with `productId` optional.
  These are NOT duplicates and must never be merged.

Keeping Item as the stock row means checkouts, order lines, pick-list lines,
and stock-count lines keep their existing FKs — those flows already operate on
"product at a location," which is exactly what Item is now.

## Phases

### Phase A — data shape (DONE 07/11/2026)
- `Product` model + `Item.productId` in `prisma/schema.prisma`
- `prisma/sql/2026-07-11_product_split_phase_a.sql`: creates table, backfills
  one product per distinct lower(name) among `returnable = false` items, links
  them. Sanity queries at the bottom of the script.
- Zero app behavior change. Deploy order: run SQL first, then deploy (build
  runs `prisma generate`).

### Phase B — product-centric UI (next session)
- `/api/products` CRUD (+ merge endpoint: move stock rows from product X → Y,
  delete X) — gate `item:update`/`item:create`.
- Items page: group by product — one row per product, total qty, expandable
  per-location breakdown; ungrouped toggle for the old flat view. Serialized
  gear listed as today.
- Product detail page: master fields + stock table (location / qty / lot / exp)
  + "add stock at location" (creates an Item row with productId).
- Item create flow: pick or create a product first; per-location fields after.
  Renaming a product renames its stock rows (keep `Item.name` denormalized and
  synced — cheap and keeps every existing query working).
- Edit guard: master fields (name/category/unit/photo) edited on the product;
  item edit form drops those fields when `productId` set.

### Phase C — flows
- Scan: UPC hits `Product.barcode` → product page with per-location stock
  (item label barcodes still resolve to the item).
- CSV import: resolve/create product per row (by name or UPC), then upsert the
  location stock row.
- Digest + low-stock: alert per product (sum across locations) using
  `defaultLowStockThreshold`, with per-location override still honored.
- Reports/dashboard/exports: totals by product.

### Phase D — hardening
- Enforce `productId NOT NULL` where `returnable = false` (SQL check
  constraint), admin "merge duplicates" tool for stragglers the lower(name)
  dedupe missed ("Gauze 4x4" vs "4x4 Gauze").

## Migration safety
- Phase A SQL is additive (new table + nullable column) — instant rollback is
  `alter table "Item" drop column "productId"; drop table "Product";`
- Never `prisma db push` (shared-DB rule); raw SQL + `npx prisma generate`.
- The backfill only touches `returnable = false` rows.

## Watch-outs for Phase B implementer
- `Item.name` stays the source for existing UI until B ships; sync on product
  rename, don't drop the column.
- Pick-list templates reference itemId (location-specific!) — Phase C should
  re-point templates at productId + resolve location at pick time, else a
  template built from Bag 1's rows won't decrement Bag 2's stock.
- Clone (locations/[id]/clone) should set productId on cloned items (same
  product, new location) — one-line change, do it in Phase B.
