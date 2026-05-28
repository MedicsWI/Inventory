# MIGRATION-PLAN.md — Pre-Lifest People/Events/Alerts Consolidation

**Decision:** Consolidate **people, events, and alert broadcasts** out of the Inventory app and into the **Ops Hub** before Lifest 2026 (07/08/2026). Inventory keeps what it should have only ever been: physical items, locations, checkouts, stock counts, pick lists, incoming orders.

**Status:** In progress. Started 05/27/2026. Target complete: 06/17/2026 (~3 weeks of buffer before Lifest).

**This doc lives in both repos.** Sync any changes by hand. Authoritative copy: Ops Hub repo.

---

## Cross-session coordination

There are **two Cowork sessions** working on this — one in each repo. They don't share memory. To stay aligned:

1. **Read this doc at the start of every session.** It's the source of truth.
2. **Tick checkboxes** as you complete phases. Each session ticks its own.
3. **Append to the Handoff Log at the bottom** whenever you finish a chunk so the other session knows.
4. **Migration task ID is #130 in Ops Hub.** Reference it in the inventory session as "Ops Hub task #130" to stay synced.
5. **Don't both run database operations on the same target at the same time.** During cutover, one session at a time.

Sections clearly labeled **[OPS HUB SESSION]** vs **[INVENTORY SESSION]** below. Don't do the other side's work — it'll create conflicts.

---

## What's moving

10 Prisma models in Inventory → 9 new tables in Ops Hub (one model merges into existing `events`):

| Inventory (Prisma) | Ops Hub (target) | Notes |
| --- | --- | --- |
| `Volunteer` | `public.volunteers` (new) | Brian's decision: separate table, linked to `users` by email when applicable |
| `Event` | `public.events` (existing) + new columns | Merge — add `status`, `gear_categories`, `notes`, `template_id` |
| `EventShift` (volunteer coverage) | `public.volunteer_event_shifts` (new) | **Do NOT collide with existing `public.event_shifts` which is paid staff** |
| `EventTemplate` | `public.event_templates` (new) | |
| `EventTemplateShift` | `public.event_template_shifts` (new) | |
| `EventSignOut` | `public.event_signouts` (new) | Gear sign-out tracking |
| `EventSignOutItem` | `public.event_signout_items` (new) | Per-category gear in/out cycles |
| `AlertSubscriber` | `public.alert_subscribers` (new) | Phone + email + delivery method |
| `Alert` | `public.alerts` (new) | Broadcast records |
| `AlertSend` | `public.alert_sends` (new) | Per-recipient send log |

---

## Key design decisions (locked)

1. **Paid vs Volunteer shifts:** Separate tables. `event_shifts` = paid staff (existing). `volunteer_event_shifts` = volunteer coverage blocks (new).
2. **Volunteer ↔ User:** Two records linked by email. `volunteers.user_id` populated when their email matches a `users.email`. Volunteers can exist without a user account (RegPack walk-ins).
3. **Alert scope:** Event-scoped subscriptions with system-wide topics (LOST_CHILD, SEVERE_WEATHER, ALL_HANDS, GEAR_RETURN). Subscriber opts in for one event; subscription auto-expires when event closes.
4. **Delivery channels:** SMS via Twilio, email via Resend, or both. Subscriber chooses at signup time.
5. **QR + email posters:** Not yet printed. Print with new Ops Hub URL only. No redirect needed.
6. **Twilio inbound webhook:** Repoint from inventory to Ops Hub during cutover.

---

## Phase checklist

### Phase 0 — Planning (DONE — 05/27/2026)

- [x] Map Inventory → Ops Hub schema
- [x] Lock design decisions
- [x] Write this doc
- [x] Notify inventory session (Brian copies doc into inventory repo)

### Phase 1 — Schema in Ops Hub [OPS HUB SESSION]

- [ ] Migration 047: `volunteers` table
- [ ] Migration 048: `event_templates` + `event_template_shifts`
- [ ] Migration 049: extend `events` table with status/gear_categories/notes/template_id
- [ ] Migration 050: `volunteer_event_shifts`
- [ ] Migration 051: `event_signouts` + `event_signout_items`
- [ ] Migration 052: `alert_subscribers`
- [ ] Migration 053: `alerts` + `alert_sends`
- [ ] Run all migrations against Ops Hub Supabase project
- [ ] Verify `select * from information_schema.tables where table_schema='public' and table_name in (...);` returns all 9

### Phase 2 — Backend port [OPS HUB SESSION]

Translate Inventory's API routes to Ops Hub's Supabase pattern (see "Code transfer strategy" below):

- [ ] `/api/events` (list, create) + `/api/events/[id]` (get, update, delete)
- [ ] `/api/events/[id]/shifts` and `/api/events/[id]/shifts/[shiftId]` → use new `volunteer_event_shifts` table
- [ ] `/api/events/[id]/sign-outs` + nested items
- [ ] `/api/event-templates` + `/api/event-templates/[id]/spawn`
- [ ] `/api/volunteers` + `/api/volunteers/import` + `/api/volunteers/missing-data-alert` + `/api/volunteers/[id]`
- [ ] `/api/alert-subscribers` (list, create, get, signup)
- [ ] `/api/alerts/broadcast` (the main one)
- [ ] `/api/alerts` (audit log)
- [ ] `/api/twilio/inbound` (STOP handling)

### Phase 3 — UI port [OPS HUB SESSION]

- [ ] `/events` (list)
- [ ] `/events/[id]` (sign-out sheet)
- [ ] `/events/[id]/kiosk` (kiosk check-in)
- [ ] `/events/[id]/alert-signup` (QR/email signup public page — no auth)
- [ ] `/event-templates` + `/event-templates/[id]` + `/event-templates/[id]/edit`
- [ ] `/volunteers` + `/volunteers/[id]`
- [ ] `/account/alerts` (per-user channel preferences)
- [ ] **New:** Dispatcher broadcast UI (event picker → topic tiles → compose → confirm → send)
- [ ] Sidebar updates: add People → Volunteers, People → Events, People → Alert Subscribers

### Phase 4 — Data export [INVENTORY SESSION]

- [ ] Write `scripts/migration/export.ts` in inventory repo (or use script from Ops Hub repo — see below)
- [ ] Run export against inventory Supabase. Output CSVs to `scripts/migration/data/`:
  - [ ] `volunteers.csv`
  - [ ] `events.csv`
  - [ ] `event_shifts.csv` (inventory's, becomes volunteer_event_shifts)
  - [ ] `event_templates.csv`
  - [ ] `event_template_shifts.csv`
  - [ ] `event_signouts.csv`
  - [ ] `event_signout_items.csv`
  - [ ] `alert_subscribers.csv`
  - [ ] `alerts.csv`
  - [ ] `alert_sends.csv`
- [ ] Share CSVs with Ops Hub session (Brian copies between repos)

### Phase 5 — Data transform + import [OPS HUB SESSION]

- [ ] Run `scripts/migration/transform.ts` — converts cuid → uuid, camelCase → snake_case, builds id-mapping JSON
- [ ] Run `scripts/migration/import.ts` against Ops Hub Supabase
- [ ] Verify row counts match (export N → import N for each table)
- [ ] Spot-check 5 rows per table: alert_subscribers (real phones), volunteers (real cert info), events (Lifest 2026)

### Phase 6 — Vercel deploy [OPS HUB SESSION]

- [ ] Follow `docs/VERCEL-DEPLOY-CHECKLIST.md`
- [ ] Deploy to `ops.medicswisconsin.com`
- [ ] Test broadcast: send to your own phone
- [ ] Test signup: scan a test QR poster
- [ ] Test kiosk: walk through add-person + walk-in path

### Phase 7 — Cutover [BOTH SESSIONS, COORDINATED]

Pick a window: **05:00–06:00 AM CT on a non-event day**. Steps in order:

1. **[INVENTORY SESSION]** Put inventory's event/volunteer/alert endpoints in read-only mode (return 503 for writes) OR deploy a redirect-only version of those routes
2. **[OPS HUB SESSION]** Re-run import for any new rows since last export (incremental)
3. **[BRIAN]** In Twilio console: change inbound webhook URL from `inventory.medicswisconsin.com/api/twilio/inbound` to `ops.medicswisconsin.com/api/twilio/inbound`
4. **[BRIAN]** In Supabase (inventory project): pause realtime on the moved tables to prevent confusion
5. **[OPS HUB SESSION]** Send a test broadcast end-to-end — verify SMS arrives, audit row written
6. **[OPS HUB SESSION]** Send a test STOP from a test phone — verify the subscriber is marked stopped in Ops Hub

### Phase 8 — Decommission [INVENTORY SESSION]

After Ops Hub has been running for 48 hours without issues:

- [ ] Delete inventory's `/api/events/*` routes (or keep as 301 redirects to Ops Hub)
- [ ] Delete inventory's `/api/volunteers/*` routes
- [ ] Delete inventory's `/api/alert-subscribers/*` routes
- [ ] Delete inventory's `/api/alerts/*` routes
- [ ] Delete inventory's `/api/twilio/inbound` route
- [ ] Delete inventory's UI pages: `/events`, `/events/[id]`, `/events/[id]/kiosk`, `/events/[id]/alert-signup`, `/event-templates`, `/volunteers`, `/account/alerts`
- [ ] Drop the Prisma models from inventory's schema (separate migration; backup first)
- [ ] Remove the `OPSHUB_API_KEY` env var from inventory's Vercel
- [ ] Update inventory's sidebar/nav to remove the orphaned links

### Phase 9 — Cleanup [OPS HUB SESSION]

- [ ] Delete `scripts/migration/data/*.csv` (PHI — don't commit)
- [ ] Remove `.env.migration` from local
- [ ] Update `docs/CHANGELOG.md` with the migration
- [ ] Confirm Lifest 2026 walkthroughs still work — re-run the 06/02 test sessions if needed
- [ ] Decide: archive `docs/MIGRATION-PLAN.md` or mark COMPLETE at top

---

## Code transfer strategy — copy + adapt

For each Inventory page or API route:

1. **Copy file** from `medics-inventory/src/app/...` to equivalent path in `Medics Wisconsin Dispatch System/web/src/app/...`
2. **Find-and-replace these patterns:**
   - `import { prisma } from "@/lib/prisma"` → `import { createClient } from "@/lib/supabase/server"` then `const supabase = await createClient();`
   - `prisma.volunteer.findMany({ where: { ... }, orderBy: { ... } })` → `supabase.from("volunteers").select("*").eq(...).order(...)`
   - `prisma.alert.create({ data })` → `supabase.from("alerts").insert(data).select().single()`
   - `getServerSession(authOptions)` → `await supabase.auth.getUser()` then check `data.user`
   - Prisma `where: { eventId }` → Supabase `.eq("event_id", eventId)`
   - Prisma relation includes → use Supabase's foreign-key join syntax: `select("*, volunteer:volunteers(*)")`
   - camelCase columns in code → snake_case
   - `cuid()` IDs in URLs → uuid IDs (just don't fight the format; both work in URLs)
3. **Update UI styling** to match Ops Hub conventions:
   - Use sidebar group accents where appropriate (People → fuchsia)
   - Card styles already match (both apps use `bg-card` etc.)
   - Replace any inventory-specific colors (cyan stays cyan)
4. **Role gating:** Use Ops Hub's role system from `me.role`. Inventory uses `ADMIN`/`MANAGER`/`MEDIC`. Ops Hub uses `admin`/`supervisor`/`dispatcher`/`field_responder`/`viewer`. Mapping:
   - `ADMIN` → `admin`
   - `MANAGER` → `supervisor`
   - `MEDIC` → `field_responder` (or `dispatcher` depending on context)

Estimated translation effort per page: 1–3 hours. Stickier ones (kiosk, broadcast UI) maybe 4–6 hours each.

---

## Data migration scripts

Lives in: `Medics Wisconsin Dispatch System/scripts/migration/`

Files:
- `00-readme.md` — how to run
- `01-export.ts` — Reads from inventory Supabase via `pg`, writes CSVs to `data/`. Run from inventory repo OR from ops hub repo with inventory's DATABASE_URL.
- `02-transform.ts` — Reads CSVs, transforms IDs/casing, writes new CSVs to `data/transformed/`. Builds `id-mapping.json` so foreign keys stay aligned.
- `03-import.ts` — Reads transformed CSVs, batches into Ops Hub via `pg`. Idempotent (`on conflict do nothing`).
- `04-verify.ts` — Row counts + spot-check queries.

Configuration via `.env.migration` (gitignored):
```
INVENTORY_DATABASE_URL=postgres://...inventory project pooler url...
OPSHUB_DATABASE_URL=postgres://...ops hub project pooler url...
```

---

## Cutover runbook

| Step | Owner | Time | What |
| --- | --- | --- | --- |
| T-15 min | Brian | 04:45 | Announce cutover in Teams; verify both sessions ready |
| T-10 min | Inventory session | 04:50 | Deploy read-only mode on Inventory's moved endpoints |
| T-5 min | Ops Hub session | 04:55 | Re-run incremental export+import for any new rows since last sync |
| T+0 | Brian | 05:00 | Twilio dashboard: change inbound webhook to Ops Hub URL |
| T+2 min | Brian | 05:02 | Smoke test: send broadcast from Ops Hub UI to own phone |
| T+5 min | Brian | 05:05 | Smoke test: send STOP from test phone, verify Ops Hub captures it |
| T+10 min | Both | 05:10 | Both sessions confirm green; update Handoff Log; close cutover |

If something's broken at T+10: flip Twilio webhook back to Inventory, reverse the read-only mode, fix in daylight.

---

## Rollback plan

The Ops Hub side is additive (new tables, new pages) — leaving it deployed is fine.

To roll back the **cutover**:
1. Twilio webhook back to Inventory
2. Re-enable Inventory's endpoints (revert the read-only deploy)
3. Stop Ops Hub's dispatcher broadcast UI from being shown (feature flag or hide nav link)
4. Any subscribers added in the Ops Hub window need to be reverse-migrated (script in `scripts/migration/99-reverse.ts` to be written if needed)

The reverse migration is unlikely to be needed but should exist as insurance.

---

## Risks (live, update as discovered)

| Risk | Status | Mitigation |
| --- | --- | --- |
| Existing alert subscribers lose STOP status | Open | Migrate `stopped`+`stopped_at`; spot-check 10 STOP records pre/post |
| Inventory team is mid-flight on roadmap | Open | This doc tells them what's freezing |
| Auth user mismatch (different email casing) | Open | Match on `lower(email)` in matching script |
| Cutover-window STOP messages lost | Low | Pick 05:00 AM CT window, monitor Twilio logs |
| Volunteer's existing kiosk PIN/badges | Open | Need to confirm — TBD whether inventory uses any |
| Capacitor mobile app pointing at inventory | Open | Inventory's `NEXT_PUBLIC_API_BASE_URL` keeps the host valid; redirect path for moved endpoints |
| RegPack import cycle in inventory | Open | Move volunteer import job to Ops Hub — see Phase 2 |

---

## [FOR THE INVENTORY SESSION]

Your job in this migration:

1. **Right now:** Read this doc. Don't add new features to: `Volunteer`, `Event`, `EventShift`, `EventTemplate`, `EventSignOut`, `AlertSubscriber`, `Alert`. Only do bug fixes if absolutely required.
2. **Phase 4 (when Ops Hub session signals ready):** Run the export script. Hand the CSVs to Brian to drop into Ops Hub repo.
3. **Phase 7 cutover:** Deploy read-only mode on the moved endpoints. Coordinate timing with Brian.
4. **Phase 8 decommission:** After Ops Hub has been live 48 hours, remove the moved pages and APIs. Write a Prisma migration to drop the moved models.

Things you do NOT touch in this migration:
- Items, Locations, Categories, Tags
- Checkouts, StockCounts, PickLists, IncomingOrders
- ActivityLog, Notification (the inventory-domain ones)
- Auth setup
- Inventory's own deployed URL — that stays

When you need to tell Ops Hub something, write into the Handoff Log at the bottom of this doc and tell Brian to sync.

---

## [FOR THE OPS HUB SESSION]

Your job:

1. **Phase 1:** Write and run migrations 047–053
2. **Phase 2:** Port the API routes
3. **Phase 3:** Port the UI pages
4. **Phase 5:** Import data after inventory exports
5. **Phase 6:** Deploy to Vercel + smoke test
6. **Phase 7:** Coordinate cutover
7. **Phase 9:** Cleanup

When you need to tell Inventory something, write into the Handoff Log at the bottom of this doc and tell Brian to sync.

---

## Handoff Log

Append new entries at the **top**. Format:

```
### YYYY-MM-DD HH:MM CT — [FROM SESSION] → [TO SESSION]
What's done:
- ...
What's next:
- ...
Blockers:
- ... (or "none")
```

### 2026-05-27 18:00 CT — Inventory session → Ops Hub session
What's done:
- Read MIGRATION-PLAN.md in full. Acknowledged scope freeze on Volunteer, Event, EventShift, EventTemplate, EventTemplateShift, EventSignOut, EventSignOutItem, AlertSubscriber, Alert, AlertSend.
- Confirmed: the three alert models (AlertSubscriber, Alert, AlertSend) exist in `prisma/schema.prisma` only — never pushed to prod Supabase. They'll stay in schema until Phase 8 decommission.
- Memory updated in this session: future Cowork instances on the inventory repo will know not to touch the frozen scope.
- All inventory-side dev today was within frozen scope, so I'm fully paused on it. Bug fixes only going forward.

Recent inventory-side work (pre-decision, now frozen but in prod or in PR):
- `/api/alerts/broadcast`, `/api/alert-subscribers/*`, `/api/twilio/inbound` exist in code but the underlying tables don't exist in prod Supabase — these routes will 500 if called. Decision: leave them, no purge needed mid-flight. Phase 8 cleans them up.
- `/alert-groups` admin page exists. Same status — UI loads, mutations will fail. Will be removed in Phase 8.
- Sidebar entry "Alert groups" + dashboard "Send alert" tile both visible. Will be removed in Phase 8.
- `OPSHUB_API_KEY` env var is set on inventory Vercel and was being used for Ops Hub-side calls back into inventory. Per the migration brief, Ops Hub won't call back once Phase 7 is done. Will remove the env var in Phase 8.
- `OPS-HUB-ALERT-INTEGRATION.md` exists at repo root — wrote it for the now-obsolete reverse direction. Will delete in Phase 8.

What's next on the inventory side:
- Pause net-new feature work in the frozen scope. Continue on Items / Locations / Categories / Tags / Checkouts / StockCounts / PickLists / IncomingOrders / Auth / non-alert account settings / ActivityLog / inventory-domain Notifications.
- Wait for Ops Hub signal to run Phase 4 export. When signaled, I'll write `scripts/migration/export.ts` against the inventory Supabase and hand CSVs to Brian.
- Phase 7: deploy read-only / 503-on-write mode on the moved endpoints at Brian's signal.
- Phase 8: execute decommission tasks (delete UI, delete API routes, drop Prisma models via migration, remove env vars, prune sidebar).

Blockers:
- None. Standing by.

### 2026-05-27 — Ops Hub session → Inventory session
What's done:
- Migration plan written + locked design decisions
- Tasks created (Ops Hub task #130)
- Schema migrations next
What's next:
- Ops Hub writes migrations 047–053
- Inventory: read this doc, pause net-new work in the moved scope, prepare to run export when signaled
Blockers:
- None — proceeding with Phase 1

---

*Generated by AI. Checked Once by Brian: Be sure to check for accuracy.*
