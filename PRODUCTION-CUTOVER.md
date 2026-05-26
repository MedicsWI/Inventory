# Production cutover — `inventory.medicswisconsin.com`

The condensed, run-in-order checklist for taking the app live. The full step-by-step is in `DEPLOY-TO-VERCEL.md`; this is the speed run.

**Estimated time:** ~30 minutes of active work, plus ~30 minutes for DNS propagation.

---

## Phase 0 — Pre-flight (5 min, local)

- [ ] `pnpm dev` runs clean, no errors in terminal
- [ ] Log in as admin → sidebar → `Admin → Integrations` → all three channels show **Configured** badge
- [ ] All three test buttons work:
  - **Send test email to me** → lands in inbox within 30s
  - **Send test post** → appears in Teams channel within 30s
  - **Send test push** → browser banner pops
- [ ] `/notifications` → **Check now** → expect a few alerts (seeded aspirin is expired, bandage is low)
- [ ] PO test: `/orders` → new order → vendor with your own email → **Save & send to vendor** → confirm vendor email arrives
- [ ] Events smoke test: `/event-templates` → create a test template with one shift (e.g. `09:00 – 17:00`, 24-hour) → save → spawn → on event detail, **Start event** → tap a gear cell → fill identifier/initials → **Save** → tap the open cycle → mark **IN** → **Undo start** → confirm status returns to Planned

If any of those fail, fix locally first. **Don't deploy broken**.

---

## Phase 1 — GitHub (5 min)

- [ ] Repo doesn't exist yet on GitHub? Go to https://github.com/new
  - Name: `medics-wi-inventory`
  - **Private** ← important; the env example references your tenant ID
  - Don't init with README / .gitignore / license
- [ ] In VS Code terminal at the project root:
  ```
  git init
  git add .
  git commit -m "Production-ready"
  git branch -M main
  git remote add origin https://github.com/<your-username>/medics-wi-inventory.git
  git push -u origin main
  ```
- [ ] Refresh GitHub page → confirm all files are there. **Confirm `.env` is NOT in the file list** — it should be ignored.

---

## Phase 2 — Vercel project (10 min)

- [ ] https://vercel.com/new → import the `medics-wi-inventory` repo
- [ ] Framework preset auto-detects as Next.js — accept defaults
- [ ] **Stop before clicking Deploy.** Click **Environment Variables** first.

### Paste these (Production scope on all)

Copy each from your local `.env`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | from `.env` (Supabase pooled URL) |
| `DIRECT_URL` | from `.env` (Supabase direct URL) |
| `NEXTAUTH_SECRET` | same value as local `.env` |
| `NEXTAUTH_URL` | **`https://inventory.medicswisconsin.com`** (use this exact value, even before DNS is ready) |
| `NEXT_PUBLIC_API_BASE_URL` | **`https://inventory.medicswisconsin.com`** |
| `NEXT_PUBLIC_SUPABASE_URL` | from `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env` |
| `SUPABASE_STORAGE_BUCKET` | `inventory-photos` |
| `AZURE_TENANT_ID` | `7442ffae-23b3-42f5-afde-c0ee3d79feda` |
| `AZURE_CLIENT_ID` | `abf5d942-e352-4a6d-931a-6304dadd7bb0` |
| `AZURE_CLIENT_SECRET` | from `.env` |
| `GRAPH_SEND_FROM` | `inventory-alerts@medicswisconsin.com` |
| `GRAPH_FROM_NAME` | `Medics WI Inventory` |
| `TEAMS_ALERTS_EMAIL` | `eebc8cef.medicswisconsin.com@amer.teams.ms` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from `.env` |
| `VAPID_PRIVATE_KEY` | from `.env` |
| `VAPID_CONTACT_EMAIL` | `mailto:inventory-alerts@medicswisconsin.com` |
| `CRON_SECRET` | from `.env` |
| `UPCITEMDB_API_KEY` | blank is fine |

- [ ] **Deploy**. Build takes 2–4 minutes.

### Confirm it built

- [ ] Vercel shows a green check on the deployment
- [ ] Open the temp `*.vercel.app` URL Vercel gave you
- [ ] You should see the **Login** page (don't sign in yet — wait until the real domain is wired)

---

## Phase 3 — Custom domain (5 min work + propagation wait)

### Add the domain in Vercel

- [ ] Vercel project → **Settings** → **Domains** → **Add domain**
- [ ] Enter: `inventory.medicswisconsin.com`
- [ ] Vercel shows you DNS instructions. Note the **CNAME target** (usually `cname.vercel-dns.com`)

### Add the DNS record in M365

- [ ] https://admin.microsoft.com → **Settings** → **Domains** → click `medicswisconsin.com`
- [ ] **DNS records** tab → **+ Add record**
- [ ] Type: **CNAME**
- [ ] Host name: `inventory`
- [ ] Points to address: `cname.vercel-dns.com` (or whatever Vercel showed)
- [ ] TTL: default (3600 / 1 hour)
- [ ] Save

### Wait for propagation

- [ ] Refresh the Vercel Domains page every few minutes. Status flips from "Invalid Configuration" → "Valid Configuration" with a green check. Usually 5–30 min, occasionally up to an hour.
- [ ] Vercel auto-provisions an HTTPS certificate once DNS resolves.
- [ ] Open https://inventory.medicswisconsin.com → should load the login page.

---

## Phase 4 — Final verification (5 min)

After the custom domain works:

- [ ] Sign in as admin
- [ ] Dashboard loads with your seeded data (or your imported real data, if you migrated)
- [ ] **Admin → Integrations** → all three channels still **Configured**
- [ ] Hit **Send test email to me** on the production URL → confirm it lands and the "View in app" link in the email points to `https://inventory.medicswisconsin.com/...`
- [ ] **Send test post** → confirm Teams card lands
- [ ] **Send test push** on production → enable per-device → confirm banner appears
- [ ] `/notifications` → **Check now** → confirm everything fans out to all your enabled channels
- [ ] PO test on production → send to a vendor address you control → confirm receipt + the "View in app" link works on the production URL

---

## Phase 5 — Vercel Cron (1 min, automatic)

- [ ] Vercel project → **Cron Jobs** tab → confirm an entry for `/api/notifications/check` at `0 13 * * *`
- [ ] Manual trigger to verify:
  ```
  curl -X POST https://inventory.medicswisconsin.com/api/notifications/check ^
    -H "Authorization: Bearer YOUR_CRON_SECRET"
  ```
  (Windows PowerShell uses backtick for line continuation, not `^` — or just put it all on one line.)

- [ ] Returns JSON with `created` count + `channelStats`. Anything created? Email/Teams/push should fire.

---

## Phase 6 — Tell the team (post-deploy)

- [ ] Send your team the URL: **https://inventory.medicswisconsin.com**
- [ ] On their first login, walk them through:
  - Change their password (`Change password` in sidebar footer)
  - `Alert settings` → pick channels (Push works only on devices they enable individually)
  - If they want push on phones: open the URL in Safari/Chrome → **Add to Home Screen** → open from the icon → then enable push

---

## Rollback (only if something is actually broken)

- Vercel project → **Deployments** → find the previous green deployment → **⋯** → **Promote to Production**
- DNS doesn't change; only the running build flips back.

---

## After-cutover housekeeping

Set calendar reminders:

- **22 months from secret creation** (around 2027-09 if you set up the Azure secret in 2025-11): rotate the `AZURE_CLIENT_SECRET`. Generate a new one, paste into both local `.env` and Vercel env vars, delete the old one in Azure.
- **Annually**: rotate `NEXTAUTH_SECRET` and `CRON_SECRET`. Less critical but good hygiene.

---

## Sanity check before the real cutover

I'd recommend doing a **dry run on the `*.vercel.app` temp URL first** — that way DNS and HTTPS aren't variables.

1. Skip Phase 3 initially
2. Set `NEXTAUTH_URL` to the temp Vercel URL Vercel gives you (e.g. `https://medics-wi-inventory-abc123.vercel.app`)
3. Deploy, verify everything works (Phase 4 checks on the temp URL)
4. Then update both `NEXTAUTH_URL` and `NEXT_PUBLIC_API_BASE_URL` to the real domain
5. Add the custom domain (Phase 3) and let DNS catch up
6. **Redeploy** (Vercel → Deployments → ⋯ → Redeploy) so the env var change takes effect

This way if anything goes wrong, it's not blocking your users — they don't have the URL yet.

---

*Final reminder: review the email and Teams test outputs before going live to make sure they look right. The first emails the team receives shape their perception of the system.*
