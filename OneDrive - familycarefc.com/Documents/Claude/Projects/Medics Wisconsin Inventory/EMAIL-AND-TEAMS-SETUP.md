# Email + Teams + Push + Cron — setup walkthrough

Step-by-step for wiring all outbound notifications. Designed for tenants with Conditional Access / MFA enforced (which is the modern best practice).

---

## Part 1 — Microsoft 365 email via Microsoft Graph (OAuth)

This is the recommended path. Works under Conditional Access, no app passwords needed, more secure than SMTP. Total time: ~15 minutes.

### 1. Confirm the mailbox exists

Ask IT (or check in M365 admin → Active users):

- Mailbox: `inventory-alerts@medicswisconsin.com` (or whatever you settled on)
- Exchange Online Plan 1 license assigned
- The mailbox itself doesn't need anything special — Graph sends as it via app permissions

### 2. Register the app in Entra ID

1. Go to https://portal.azure.com
2. Search **Microsoft Entra ID** → open it
3. Left nav: **App registrations** → **+ New registration**
4. Name: `Medics WI Inventory — Mail Sender`
5. Supported account types: **Accounts in this organizational directory only (single tenant)**
6. Redirect URI: **leave blank**
7. Click **Register**

On the next page, copy and stash these two values — you'll paste them into `.env`:

- **Application (client) ID** → `AZURE_CLIENT_ID`
- **Directory (tenant) ID** → `AZURE_TENANT_ID`

### 3. Create a client secret

1. Left nav of the registration: **Certificates & secrets**
2. **Client secrets** tab → **+ New client secret**
3. Description: `Inventory app`
4. Expires: pick **24 months** (max). Set a calendar reminder for ~22 months out — secrets must be rotated before they expire or alerts stop firing.
5. **Add**
6. **Copy the Value column immediately** (NOT the Secret ID). This is your `AZURE_CLIENT_SECRET`. You only see it once. Paste it into your local `.env` as `AZURE_CLIENT_SECRET="..."` — never commit the value to this file or any other tracked file.

### 4. Grant the Mail.Send permission

1. Left nav: **API permissions**
2. **+ Add a permission** → **Microsoft Graph** → **Application permissions** (NOT delegated)
3. Search **Mail.Send** → check it → **Add permissions**
4. Back on the permissions list, click **Grant admin consent for [your tenant]** — green check should appear
   - If the button is greyed out, you need to be a Global Admin or have someone with that role do this single step

### 5. Restrict the app to ONE mailbox (important security step)

Without this, the app could technically send mail as any mailbox in your tenant. Lock it down to just the inventory account.

You'll need Exchange Online PowerShell. From a Windows machine:

```powershell
Install-Module -Name ExchangeOnlineManagement -Force
Connect-ExchangeOnline

# Create a mail-enabled security group containing only the inventory mailbox
New-DistributionGroup -Name "Inventory Mail Senders" -Type "Security" -Members "inventory-alerts@medicswisconsin.com"

# Restrict the app to only sending from that group
New-ApplicationAccessPolicy `
  -AppId "<paste-AZURE_CLIENT_ID-here>" `
  -PolicyScopeGroupId "Inventory Mail Senders" `
  -AccessRight RestrictAccess `
  -Description "Inventory app can only send as the inventory-alerts mailbox"
```

If you don't have PowerShell access, skip this for now and add it later — the app still works, it's just over-permissioned until you do.

### 6. Fill in `.env`

Open the project's `.env` file and set:

```
AZURE_TENANT_ID="<the Directory ID from step 2>"
AZURE_CLIENT_ID="<the Application ID from step 2>"
AZURE_CLIENT_SECRET="<the secret Value from step 3>"
GRAPH_SEND_FROM="inventory-alerts@medicswisconsin.com"
GRAPH_FROM_NAME="Medics WI Inventory"
```

Save. **Leave the SMTP_* lines blank** — when Graph is configured it takes precedence anyway, but cleaner to leave SMTP empty.

### 7. Restart the dev server

```
Ctrl+C
pnpm dev
```

### 8. Test

1. Sign in as admin → sidebar → **Admin** → **Settings & users** → **Integrations**
2. Email card should now show **Configured** + "Microsoft Graph (OAuth)" + the From address
3. Click **Send test email to me**
4. Check your inbox — landing within 10 seconds with subject "[Medics WI Inventory] Test alert from Medics WI Inventory"

**Troubleshooting:**

| Error | Cause | Fix |
|---|---|---|
| `Token request failed: 401` | Wrong client secret OR using Secret ID instead of Value | Regenerate the secret, copy Value (not ID) |
| `Graph 403 ErrorAccessDenied` | Mail.Send permission not granted, or admin consent missing | Re-check API permissions, click "Grant admin consent" |
| `Graph 403 Access to OData is disabled` | Mailbox doesn't exist, license not applied, or Application Access Policy is misconfigured | Verify the mailbox is real and the GRAPH_SEND_FROM address matches it exactly |
| Lands in spam | DKIM/SPF not configured for the domain | M365 admin → Settings → Domains → medicswisconsin.com → DKIM tab → Enable |

### Fallback: plain SMTP

If for any reason you can't use Graph (e.g. no permission to create app registrations), leave the AZURE_* vars blank and fill in the SMTP_* vars instead. The notifier picks Graph if configured, otherwise falls back to SMTP. See `.env.example` for the SMTP variable list.

---

## Part 2 — Microsoft Teams webhook

### 1. Pick the destination channel

Recommended: a dedicated **Inventory alerts** channel in whichever team makes sense (Operations, Medics WI, etc.).

### 2. Add a Workflow

The classic "Incoming Webhook" connector is retired. Use Workflows:

1. Open the destination channel in Teams
2. **⋯** menu next to the channel name → **Workflows**
3. Search: **Post to a channel when a webhook request is received**
4. Click that template → **Next**
5. Confirm Team + Channel → **Add workflow**
6. Copy the **webhook URL** Teams shows you (long URL starting with `https://prod-XX.westus.logic.azure.com:443/workflows/...`)

### 3. `.env`

```
TEAMS_WEBHOOK_URL="<paste here>"
```

### 4. Restart + test

`Ctrl+C` → `pnpm dev` → **Admin → Integrations** → Teams card → **Send test post** → confirm it appears in the channel.

---

## Part 3 — Web push notifications

Browser-based push delivers alerts on PC, Android, and iOS (if installed as a PWA). No mobile-app build needed.

### Setup checklist

Three things on top of the email/Teams work you already have:

1. **Generate VAPID keys**: `pnpm exec web-push generate-vapid-keys` → paste both into `.env`
2. **Generate CRON_SECRET**: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` → paste into `.env`
3. **Open `/account/alerts`** → tick **Push** → **Enable push on this device** → **Send test push** → confirm browser banner appears

### Detail

**VAPID keys.** They identify your server to browsers' push services. Generate once, keep forever (don't rotate unless compromised).

```
pnpm exec web-push generate-vapid-keys
```

Copy both values:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<the public key — safe to expose>"
VAPID_PRIVATE_KEY="<the private key — server only>"
VAPID_CONTACT_EMAIL="mailto:inventory-alerts@medicswisconsin.com"
```

Restart `pnpm dev`.

**Subscribe per device.** Push has to be enabled separately on every browser / device you want notifications on.

1. Open the app in Chrome / Edge / Firefox / Safari
2. Sidebar → **Alert settings**
3. Tick **Push notifications** (the toggle is greyed out until VAPID is configured)
4. The Push devices card appears below → **Enable push on this device**
5. Browser permission prompt → **Allow**
6. Click **Send test push** → confirm the banner pops

Repeat per browser. Each subscription shows up under "Push devices" with a friendly name (Chrome, Edge, etc.).

**iOS gotcha.** Apple only delivers push to a Safari PWA, not a regular tab. On iPhone / iPad:

1. Open the deployed URL in Safari (must be HTTPS — push doesn't work over http except localhost)
2. Share menu → **Add to Home Screen** → Add
3. Open the app from the home-screen icon (not Safari)
4. Sign in → Alert settings → enable push from inside the PWA

---

## Part 4 — Daily auto-check via Vercel Cron

Once deployed, you don't need to click "Check now." Vercel hits the endpoint on a schedule.

### A. Generate the cron secret

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Add to `.env`:

```
CRON_SECRET="<paste here>"
```

Also add it to **Vercel project → Settings → Environment Variables** with the same value (Production scope).

### B. The schedule

The repo already has a `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/notifications/check", "schedule": "0 13 * * *" }
  ]
}
```

Daily at 13:00 UTC = 7:00 AM Central (DST) / 8:00 AM Central (standard time). To change, edit the cron expression — https://crontab.guru helps.

### C. Deploy

Push to GitHub → Vercel auto-deploys → cron starts running. Confirm under **Vercel project → Cron Jobs**.

To manually trigger any time:

```
curl -X POST https://YOUR-APP.vercel.app/api/notifications/check \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Part 5 — Opt in for yourself + any other admins

Each admin / manager opts in individually:

1. Sidebar → **Alert settings**
2. Under **What I want to be alerted about** — toggles for expirations / low-stock (default on)
3. Under **Where to send them** — toggles for Email / Teams / Push (default off)
4. **Save preferences**

Medics never get these by default; only admin and manager roles can opt in.

---

## Part 6 — End-to-end test

The proper end-to-end test once everything's wired:

1. The seeded items include:
   - **Aspirin 81mg chewable** — expired (will trigger EXPIRED)
   - **Israeli Bandage 6"** — quantity at or below threshold (will trigger LOW_STOCK)
2. Sidebar → **Notifications** → **Check now**
3. Expect:
   - Toast: "X new notifications"
   - Email(s) in your inbox
   - Teams card(s) in the channel
   - Browser push banner(s)
   - In-app notifications listed on the page

If one channel doesn't fire, hit the **Send test** button on `/admin/integrations` for just that channel to isolate.

---

## Troubleshooting cheat sheet

| Symptom | Likely cause | Fix |
|---|---|---|
| Email card says "Not configured" | All AZURE_* vars blank AND SMTP_* blank | Pick one path, fill in env, restart |
| `Token request failed: 401 invalid_client` | Wrong client secret (or used the Secret ID instead of Value) | Regenerate the secret, copy Value |
| `Graph 403 ErrorAccessDenied` | Mail.Send not granted / admin consent missing | API permissions tab → re-add Mail.Send → Grant admin consent |
| `Graph 404` | GRAPH_SEND_FROM mailbox doesn't exist | Confirm the mailbox + license in M365 admin |
| Email lands in spam | DKIM/SPF not set | M365 admin → Domains → medicswisconsin.com → DKIM → Enable |
| Teams test fails 400 | Workflow URL got mangled / using old format | Re-copy the URL from the channel's Workflows |
| Push toggle disabled in UI | VAPID keys missing in `.env` | Generate + paste, restart |
| Browser asked for permission but no banner | Test push was sent before subscribing on this device | Hit "Enable push on this device" first |
| Push works in Chrome but not iPhone | Opened from Safari instead of the home-screen PWA | Add to Home Screen, open from there |

---

*Internal use only. Treat client secrets, app passwords, VAPID keys, and webhook URLs like passwords — don't commit them, don't share them in chat, don't paste them into screenshots.*
