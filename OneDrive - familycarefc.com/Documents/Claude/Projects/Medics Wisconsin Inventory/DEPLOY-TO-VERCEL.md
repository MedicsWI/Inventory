# Deploy to Vercel — step-by-step

Gets the app off your laptop and on a real URL that your team can reach from anywhere. Free tier handles your traffic. Total time: ~30 minutes the first time, ~30 seconds for every deploy after.

---

## Prerequisites (do these once)

- [ ] **GitHub account** — sign up at https://github.com if you don't have one
- [ ] **Vercel account** — sign up at https://vercel.com with your GitHub account ("Sign up with GitHub" is fastest)
- [ ] **Git installed locally** — confirm with `git --version` in your VS Code terminal. If it errors, install from https://git-scm.com/download/win
- [ ] **Subdomain decision** — `inventory.medicswisconsin.com` is the natural choice. We'll set this up at the end; Vercel gives you a temp URL in the meantime.

---

## Part 1 — Push the code to GitHub

### 1. Make sure `.env` is NOT going to be committed

Open `.gitignore` (already in the project root) and confirm it lists:

```
.env
.env.local
.env.*.local
```

Those should already be there. **Never commit `.env`** — it has secrets.

### 2. Initialize the local git repo

In VS Code terminal, in the project folder:

```
git init
git add .
git commit -m "Initial commit"
```

Expected output: a list of files staged, then "main 1234567 Initial commit" with a count.

### 3. Create the GitHub repo

- Go to https://github.com/new
- Repository name: `medics-wi-inventory`
- **Private** (very important — the code references your internal email patterns, Azure tenant ID via Mail.Send permission, etc.)
- **Don't** initialize with README / gitignore / license (you already have those)
- Click **Create repository**

### 4. Push to GitHub

GitHub will show you commands. Use the "push an existing repository" block. It looks like:

```
git remote add origin https://github.com/YOUR-USERNAME/medics-wi-inventory.git
git branch -M main
git push -u origin main
```

You'll likely be prompted to sign into GitHub — accept the popup. After it pushes, refresh the GitHub page and confirm your files are there.

---

## Part 2 — Set up the Supabase production database

The dev DB you're using right now will work for production, but it's worth understanding what you have:

- The `DATABASE_URL` / `DIRECT_URL` you put in `.env` point to your Supabase project. That same project is your prod DB unless you create a second one.
- For a real small-team deployment, **keep using the one Supabase project** — it's fine.
- For higher safety, create a separate "Medics WI Inventory — Prod" Supabase project and use those URLs in Vercel (so dev work can't corrupt prod data). Optional for now.

If you want to migrate to a dedicated prod DB later, the path is:

1. Create new Supabase project
2. Copy the connection strings
3. Run `pnpm db:push` against the new DB once
4. Seed: `pnpm db:seed` (or skip if you'd rather start clean)

For now, the simpler default: use the existing Supabase project. Vercel gets the same `DATABASE_URL` / `DIRECT_URL` you already have in `.env`.

---

## Part 3 — Create the Vercel project

### 1. Import the GitHub repo

- Go to https://vercel.com/new
- Click **Import** next to your `medics-wi-inventory` repo
- If the repo doesn't show, click **Adjust GitHub App Permissions** and grant access to that repo

### 2. Configure project

Vercel auto-detects Next.js. Defaults are fine. Stop before clicking Deploy — we need env vars first.

### 3. Add environment variables

Click **Environment Variables**. Paste each one from your local `.env`. **Apply to Production, Preview, AND Development scopes** (top-right toggle on each var) unless noted.

Required:

| Variable | Source |
|---|---|
| `DATABASE_URL` | Supabase pooled connection string |
| `DIRECT_URL` | Supabase direct connection string |
| `NEXTAUTH_SECRET` | Same value you generated locally — don't regenerate |
| `NEXTAUTH_URL` | **Change to your final URL** (e.g. `https://inventory.medicswisconsin.com`) — see Part 6 for the temp URL |
| `NEXT_PUBLIC_API_BASE_URL` | Same as NEXTAUTH_URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | `inventory-photos` |
| `AZURE_TENANT_ID` | Azure app registration tenant ID |
| `AZURE_CLIENT_ID` | Azure app client ID |
| `AZURE_CLIENT_SECRET` | Azure app client secret value |
| `GRAPH_SEND_FROM` | `inventory-alerts@medicswisconsin.com` |
| `GRAPH_FROM_NAME` | `Medics WI Inventory` |
| `TEAMS_ALERTS_EMAIL` | The Teams channel email |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | From `pnpm exec web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Same command, private value |
| `VAPID_CONTACT_EMAIL` | `mailto:inventory-alerts@medicswisconsin.com` |
| `CRON_SECRET` | Long random string (we generated this earlier) |
| `UPCITEMDB_API_KEY` | Blank is fine; uses trial endpoint |

Optional (only if you set up Google SSO):

| Variable | Source |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |

### 4. Deploy

Click **Deploy** at the bottom. First build takes 2–4 minutes.

When it's done, Vercel shows a URL like `medics-wi-inventory-xyz.vercel.app`. Open it. You should see your login page.

---

## Part 4 — Verify the deploy works

In the new browser tab on your Vercel URL:

- [ ] Login page loads
- [ ] Sign in with `admin@medicswi.local` (or whatever email you set) and the password you remember
- [ ] Dashboard loads with seeded data
- [ ] **Admin → Integrations** → all three channels show **Configured**
- [ ] Send a test email — confirm it lands
- [ ] Send a test Teams post — confirm it lands
- [ ] Enable push **on this browser** — get a permission prompt; allow; send test push

If any of those fail, the env var for that piece is missing or wrong. Check Vercel project → Settings → Environment Variables.

---

## Part 5 — Update NEXTAUTH_URL for the real domain

You used a placeholder. Once you have the real URL:

- Vercel project → Settings → Environment Variables
- Find `NEXTAUTH_URL` → Edit → set to the real URL (e.g. `https://inventory.medicswisconsin.com` once Part 6 is done, OR just leave as your `*.vercel.app` URL if you're not setting up a custom domain yet)
- Same for `NEXT_PUBLIC_API_BASE_URL`
- Redeploy: project → Deployments → click ⋯ on the latest → **Redeploy**

---

## Part 6 — Custom domain (`inventory.medicswisconsin.com`)

### 1. Add the domain in Vercel

- Vercel project → Settings → Domains
- Add: `inventory.medicswisconsin.com`
- Vercel shows you DNS records to add

### 2. Add the DNS record at your domain registrar

Find where `medicswisconsin.com` DNS lives. If it's managed in **M365 / Microsoft 365** (most common), add the record there:

- M365 admin → Settings → Domains → `medicswisconsin.com` → **DNS records** tab → **+ Custom record**
- Type: **CNAME**
- Host: `inventory`
- Points to: `cname.vercel-dns.com` (or whatever Vercel showed you)
- TTL: leave default

If DNS is elsewhere (GoDaddy, Namecheap, Cloudflare), add the same CNAME in that registrar's DNS panel.

### 3. Verify

DNS propagation takes 5–60 minutes. Vercel auto-detects when it's ready and provisions an HTTPS certificate. Domain status will flip to "Valid Configuration" with a green check.

Open `https://inventory.medicswisconsin.com` — should load your app.

### 4. Update NEXTAUTH_URL

Once the custom domain works:

- Vercel project → Settings → Environment Variables
- `NEXTAUTH_URL` → `https://inventory.medicswisconsin.com`
- `NEXT_PUBLIC_API_BASE_URL` → same
- Redeploy

---

## Part 7 — Vercel Cron (daily alerts)

Already wired. The `vercel.json` in the repo configures it. When you deployed in Part 3, the cron was set up automatically.

- Verify: Vercel project → **Cron Jobs** tab → you should see `0 13 * * *` (or whatever you set) for `/api/notifications/check`
- It runs daily at the time you specified. First run is the next time that schedule hits.
- Manual trigger any time:
  ```
  curl -X POST https://inventory.medicswisconsin.com/api/notifications/check \
    -H "Authorization: Bearer YOUR_CRON_SECRET"
  ```

---

## Part 8 — Re-redirect URIs (Azure, Google)

If you set up Google SSO, add the production callback to Google Cloud:

- Google Cloud Console → APIs & Services → Credentials → your OAuth client
- Authorized redirect URIs → add `https://inventory.medicswisconsin.com/api/auth/callback/google`

Azure doesn't need a redirect URI for the email app (it's client-credentials, no user flow). But if you ever add user-context features, you'd update the Azure app's redirect URI similarly.

---

## Part 9 — Going forward

After the initial deploy, every code change follows this loop:

```bash
# locally
git add .
git commit -m "describe the change"
git push

# Vercel auto-builds + deploys in ~2 minutes. Watch progress at:
#   https://vercel.com/your-username/medics-wi-inventory/deployments
```

Preview deployments: every branch and every PR gets its own preview URL. So you can test changes before merging to main.

To roll back: Vercel → Deployments → find a previous good deployment → ⋯ → **Promote to Production**.

---

## Troubleshooting cheat sheet

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails on Vercel | Missing env var that's required at build time | Vercel → Settings → Environment Variables → confirm all required entries present in Production scope |
| Login redirects in a loop | `NEXTAUTH_URL` doesn't match the actual URL you're visiting | Set NEXTAUTH_URL to the exact URL (https://, no trailing slash) |
| `EmailSignin error` or "Configuration" page | `NEXTAUTH_SECRET` missing or differs from local | Same secret value as local, in Vercel env vars |
| 500 on `/api/items` etc. | DATABASE_URL not reachable from Vercel | Confirm Supabase project allows Vercel's IPs (default Supabase setup does) |
| Photo upload fails | SUPABASE_SERVICE_ROLE_KEY missing | Add it; restart not needed, Vercel re-reads on next request |
| Push doesn't work on prod | VAPID keys differ between local and Vercel | Make sure NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are IDENTICAL in both `.env` and Vercel |
| Cron never fires | `CRON_SECRET` not set in Vercel | Add it to Vercel env vars; cron job uses it automatically |

---

*Once deployed, the app lives at the URL above. You can close VS Code and turn off your laptop — the production app keeps running on Vercel.*
