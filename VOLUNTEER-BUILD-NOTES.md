# Volunteer system — build notes

## What's new
- **Volunteer model** in Prisma with `MEDICAL` / `SECURITY` types, credential tracking, and verification audit (`credVerifiedById` + `credVerifiedAt` auto-stamped server-side).
- **`/volunteers` list page** — search, type filter (Medical/Security), unverified + expiring-soon filter chips, CSV import.
- **`/volunteers/[id]` detail/edit page** — identity, credential, acknowledgments, event context, emergency contact, notes, event history.
- **CSV import** (`/api/volunteers/import`) — upserts by email; never overwrites the manual verification work I've already done on a volunteer.
- **Daily missing-data digest** (`/api/volunteers/missing-data-alert`) — runs at 14:00 UTC via Vercel Cron; also has a "Send missing-data digest" button at the top of `/volunteers` for manual runs.
- **Sidebar** — Volunteers entry added under Admin (gated to ADMIN / MANAGER).

## Required fields the digest looks for

Both types: DOB, shirt size, emergency contact name + phone, cart waiver signed, welcome email sent. Plus license expiration (expired or within 30d flags either way).

Medical adds: license level, license number, license expiration date, license verified.

Security: no license required (you only enter their credential if they have one).

## Steps to deploy

1. From `C:\Projects\medics-inventory`:
   ```
   npx prisma db push
   ```
   This adds the `Volunteer` table, the `VolunteerType` / `CredLevel` enums, the `EventSignOut.volunteerId` column, and the `User -> Volunteer` verifier relation.

2. Commit and push:
   ```
   git add -A
   git commit -m "Add Volunteer roster + missing-data daily digest"
   git push
   ```
   Vercel auto-deploys.

3. Optional env var on Vercel (Project Settings -> Environment Variables):
   - `VOLUNTEER_DIGEST_RECIPIENTS` -- semicolon or comma-separated list of emails to receive the daily digest. If not set, every ADMIN and MANAGER gets it.

## How to test

1. Open `/volunteers`. List should be empty.
2. Click **Import CSV**, paste a few rows from `volunteer-import-template.csv`, run import. Verify created count matches.
3. Click into a record. Mark the license as verified -- it should auto-stamp your name + timestamp under the checkbox.
4. Click **Send missing-data digest** at the top. Check your inbox for the formatted digest grouping medical vs security with the missing fields highlighted per row.

## Files touched

- `prisma/schema.prisma`
- `src/app/api/volunteers/route.ts`
- `src/app/api/volunteers/[id]/route.ts`
- `src/app/api/volunteers/import/route.ts`
- `src/app/api/volunteers/missing-data-alert/route.ts` (new)
- `src/app/(app)/volunteers/page.tsx`
- `src/app/(app)/volunteers/[id]/page.tsx`
- `src/components/app-nav.tsx`
- `vercel.json`

## Verify outputs before relying on them
- After import: spot-check a few records against the RegPack source.
- After first digest: confirm the email rendered cleanly in Outlook (Microsoft renderer sometimes strips inline styles).

> PHI reminder: DOB, emergency contact info, and license numbers are sensitive. Don't paste real volunteer data into chat — use the CSV import directly into the app.
