# Deploy checklist — 2026-05-27

Covers the inventory app changes from this session:

1. Inventory email-alert fix (ADMIN/MANAGER always receive)
2. Ops Hub color system + sidebar restyle + new menu group
3. Volunteer "+ New volunteer" hand-add
4. Kiosk add-person: search volunteers + new walk-in path
5. Daily volunteer missing-data digest
6. Alert groups: subscribers + broadcast + QR signup + STOP webhook
7. Ops Hub integration endpoints

## 1. Schema push

From `C:\Projects\medics-inventory`:

```powershell
npx prisma db push
```

This adds three new tables (`AlertSubscriber`, `Alert`, `AlertSend`), three new
enums (`AlertTopic`, `AlertSource`, `AlertSendStatus`), and a few new relations.
Volunteer schema additions from the prior session are already on the DB.

## 2. Environment variables (Vercel)

Add these to the inventory project (Production environment). Existing ones stay.

| Key | Required? | Value |
| --- | --- | --- |
| `OPSHUB_API_KEY` | If wiring Ops Hub | Generate with `openssl rand -hex 32` (or any 32+ char random string). Set the same value in the Ops Hub project. |
| `TWILIO_MESSAGING_SERVICE_SID` | Strongly recommended (A2P) | Your registered Messaging Service SID from Twilio Console. When set, `sendSms` uses it instead of a single From number. Leave `TWILIO_FROM_NUMBER` set as fallback. |
| `VOLUNTEER_DIGEST_RECIPIENTS` | Optional | Semicolon or comma list of emails for the daily volunteer digest. If unset, every ADMIN/MANAGER gets it. |

## 3. Twilio configuration

In the Twilio Console (Messaging → your Messaging Service → Integration):

- **Inbound message handling**: set to "Send a webhook"
- **Request URL**: `https://inventory.medicswisconsin.com/api/twilio/inbound`
- **Method**: HTTP POST

This is what writes STOP / START opt-outs into the subscriber table. Twilio
will also still handle the carrier-mandated STOP reply automatically.

If you don't set this up right away, STOP will still work at the carrier level
(Twilio will stop delivering) — you'll just lose the local audit row that
shows the subscriber clicked STOP.

## 4. Git: push everything in two commits

From `C:\Projects\medics-inventory`. Use single-quotes around `(app)` paths so
PowerShell doesn't choke on the parens.

```powershell
git status
```

Expected modified + untracked files:
- prisma/schema.prisma
- src/middleware.ts
- src/lib/twilio.ts
- src/lib/ops-hub-auth.ts
- src/components/app-nav.tsx
- src/app/globals.css
- tailwind.config.ts
- src/app/api/notifications/check/route.ts
- src/app/api/alert-subscribers/
- src/app/api/alerts/
- src/app/api/twilio/
- src/app/api/volunteers/missing-data-alert/ (if not already shipped)
- src/app/(app)/dashboard/page.tsx
- src/app/(app)/alert-groups/
- src/app/(app)/volunteers/page.tsx (if not already shipped)
- src/app/events/[id]/alert-signup/
- VOLUNTEER-BUILD-NOTES.md
- OPS-HUB-ALERT-INTEGRATION.md
- DEPLOY-CHECKLIST-2026-05-27.md

Two commits keeps the history clean:

```powershell
# Commit 1 — visual + alert fix (low-risk, ship first if you want to split deploys)
git add tailwind.config.ts src/app/globals.css src/components/app-nav.tsx
git add src/app/api/notifications/check/route.ts
git commit -m "UI: adopt Ops Hub color system + sidebar accents; inventory emails: ADMIN/MANAGER always receive"

# Commit 2 — alert groups system + Ops Hub integration
git add prisma/schema.prisma src/middleware.ts src/lib/twilio.ts src/lib/ops-hub-auth.ts
git add src/app/api/alert-subscribers src/app/api/alerts src/app/api/twilio
git add 'src/app/(app)/alert-groups' 'src/app/(app)/dashboard/page.tsx'
git add src/app/events
git add OPS-HUB-ALERT-INTEGRATION.md DEPLOY-CHECKLIST-2026-05-27.md
git commit -m "Alert groups: per-event SMS broadcast lists, QR signup, Ops Hub API"

git push
```

Vercel auto-deploys. Watch the build dashboard.

## 5. Smoke tests after deploy

### 5a. Visual
- Open `/dashboard`. Sidebar should show six color-coded sections with small dots and tinted small-caps titles. Logo badge top-left in cyan-tinted square.
- Toggle between sections. Active row highlights using `bg-primary/15`.

### 5b. Inventory email fix
- `/notifications` → click "Check now". Expect every ADMIN/MANAGER in your team to receive an email if there's anything expiring or low. (If nothing to alert, response shows `created: 0` — still good.)

### 5c. Volunteers hand-add
- `/volunteers` → "+ New volunteer" → fill basics → Save & open record. Should jump to the detail page with the new record.

### 5d. Kiosk walk-in
- Open any active event's kiosk: `/events/[id]/kiosk`. Add person → search 2+ letters → tap a match. Search "Test Walkin" → no matches → "New security walk-in" → fill form, save. Delete the test record afterward via `/volunteers`.

### 5e. Volunteer daily digest
- `/volunteers` → "Send missing-data digest" → check email arrived. Lists medical + security separately with chips for missing fields.

### 5f. Alert groups — public QR
- From your phone, scan the QR shown on `/alert-groups`. Fill the form. You should get a confirmation SMS. Then in `/alert-groups` you should appear as a subscriber under that event with source `QR`.

### 5g. Alert groups — broadcast
- `/alert-groups` → pick the event you just signed up to → "Send alert" → topic `LOST_CHILD`, body "Test alert please ignore", type the event name to confirm → Send. Your phone should receive: `[Medics WI · <event>] LOST CHILD — Test alert please ignore`. Check `/alert-groups` updates the "By topic" panel.

### 5h. STOP keyword
- Reply STOP to the test alert. In `/alert-groups`, your row should show "STOPPED" tag (will update on next reload).
- Hand-add yourself again or re-scan QR — STOPPED tag clears.

### 5i. Ops Hub key auth (only if you've set OPSHUB_API_KEY)
- From a terminal that has the key:
  ```powershell
  curl https://inventory.medicswisconsin.com/api/events?status=ACTIVE -H "Authorization: Bearer <key>" -H "X-OpsHub-Actor: cli-smoke"
  ```
  Expect 200 + JSON array. With no key or wrong key, expect 401.

## 6. Share with Ops Hub team

Send them this file: `OPS-HUB-ALERT-INTEGRATION.md`. It has every endpoint, auth header, payload, and a smoke test plan they can use to wire their UI.

Once they confirm they have the API key set on their side, do step 5i above with their key for sanity.

## 7. Known follow-ups (not blockers)

- Ops Hub callback webhook for send-completion (if they want it; right now they
  poll `/api/alerts`).
- Topic-aware subscriber growth chart on the alert-groups page (would help
  show pre-event whether the QR poster is being scanned).
- Mobile collapse of the sidebar — currently `hidden md:flex`, MobileNav
  handles phones. Tablet portrait would benefit from a collapsed sidebar
  variant but it's not blocking anything.

## 8. PHI / compliance notes

- Subscriber phone numbers and names are stored encrypted-at-rest by Supabase.
- The STOP webhook stores nothing beyond what was already in the row.
- The Ops Hub Bearer key is server-to-server only — never exposed in client
  bundles. Rotate quarterly or whenever an Ops Hub admin leaves.
- Lost-child alert text should never include identifying child info beyond
  what's needed to find them safely (age, clothing, location last seen). Don't
  put PHI in broadcasts.

---

*Generated by AI. Checked Once by Brian: Be sure to check for accuracy.*
