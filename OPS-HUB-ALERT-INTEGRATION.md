# Ops Hub — Alert broadcast integration

This is the rundown to share with the Ops Hub team. It lets a **Dispatcher**
or **Supervisor** role in the Ops Hub broadcast an SMS alert from inside their
app, without anyone leaving for the Inventory app.

Inventory is the source of truth for event-scoped subscriber lists and the
audit log. The Ops Hub calls Inventory's HTTP endpoints with a Bearer API key.

## Base URL
```
https://inventory.medicswisconsin.com
```

## Auth (server-to-server)

Every request requires both headers:

```
Authorization: Bearer <OPSHUB_API_KEY>
X-OpsHub-Actor: dispatcher: Jane Doe
```

- `OPSHUB_API_KEY` — shared secret. Set the same value on:
  - Inventory side: Vercel env var `OPSHUB_API_KEY`
  - Ops Hub side: same key, stored as a secret in your Vercel project
- `X-OpsHub-Actor` — free-form label that ends up in the Inventory audit log.
  Use whichever identity the Ops Hub already has (dispatcher name + role, ticket
  number, whatever) so the Inventory audit row shows who actually fired the alert.

Rotation: change the env var on both sides simultaneously.

## Endpoints

### 1. List events you can target

Used to populate an event picker in the Ops Hub UI.

```http
GET /api/events?status=ACTIVE
Authorization: Bearer <OPSHUB_API_KEY>
```

Returns `200` with an array of:
```json
{
  "id": "ckxyz...",
  "name": "Lifest 2026",
  "status": "ACTIVE",
  "startsAt": "2026-07-09T14:00:00.000Z",
  "endsAt":   "2026-07-12T23:00:00.000Z",
  "location": "Sunnyview Expo · Oshkosh"
}
```

Status values: `PLANNED | ACTIVE | CLOSED | CANCELED`. Most dispatchers will
want to filter to ACTIVE only.

### 2. List subscribers for an event

Used to show the dispatcher how many people are reachable per topic before they hit send.

```http
GET /api/alert-subscribers?eventId=<id>&topic=LOST_CHILD
Authorization: Bearer <OPSHUB_API_KEY>
```

Optional query params:
- `topic` — one of `LOST_CHILD | SEVERE_WEATHER | ALL_HANDS | GEAR_RETURN`. Omit to get all.
- `includeStopped=1` — include people who have replied STOP. Defaults to false.

Returns an array of:
```json
{
  "id": "ck...",
  "eventId": "ck...",
  "name": "Sam Parking",
  "phone": "+19205551234",
  "department": "Parking",
  "topics": ["LOST_CHILD", "ALL_HANDS"],
  "source": "QR",
  "consentAt": "2026-07-09T14:32:01.000Z",
  "stopped": false
}
```

### 3. Hand-add a subscriber (optional)

If the Ops Hub wants to allow dispatchers to add someone they're on the phone
with, POST here:

```http
POST /api/alert-subscribers
Content-Type: application/json
Authorization: Bearer <OPSHUB_API_KEY>
X-OpsHub-Actor: dispatcher: Jane Doe

{
  "eventId": "ck...",
  "name": "Sam Parking",
  "phone": "920-555-1234",
  "department": "Parking",
  "topics": ["LOST_CHILD", "ALL_HANDS"]
}
```

Behavior:
- Phone is normalized to E.164 server-side. US digit-only inputs work.
- `source` is auto-set to `OPSHUB` when called with the API key.
- The endpoint upserts on `(eventId, phone)` — submitting again refreshes
  topics without duplicating the row.

### 4. Broadcast — the main one

```http
POST /api/alerts/broadcast
Content-Type: application/json
Authorization: Bearer <OPSHUB_API_KEY>
X-OpsHub-Actor: dispatcher: Jane Doe

{
  "eventId": "ck...",
  "topic": "LOST_CHILD",
  "body": "Lost child: 6yo girl, pink shirt, last seen near Mainstage. If found, bring to Info Booth.",
  "confirmEventName": "Lifest 2026"
}
```

Notes:
- `confirmEventName` must match the event's name exactly (case-insensitive). This
  is the "type the name to confirm" safety check. Ops Hub UI should ask the dispatcher
  to type or click-confirm before submitting.
- `body` is capped at 480 chars (will be truncated to ~317 if you push longer).
- Response:
  ```json
  {
    "alertId": "ck...",
    "topic": "LOST_CHILD",
    "eventName": "Lifest 2026",
    "total": 142,
    "queued": 140,
    "failed": 2
  }
  ```
- The Inventory side writes an `Alert` row + an `AlertSend` row per recipient with
  the Twilio SID and final status. So you get an immediate counts response, and we
  keep a permanent audit trail.

### 5. Pull past alerts (audit log)

```http
GET /api/alerts?eventId=<id>&since=2026-07-09T00:00:00Z
Authorization: Bearer <OPSHUB_API_KEY>
```

Returns the most recent 200 alerts with sender info and recipient counts.
Useful if Ops Hub wants a "Recent broadcasts" panel for a dispatcher shift handoff.

## Topics

| Topic | What it's for |
| --- | --- |
| `LOST_CHILD` | Child missing. Most subscribers will be opted in here. |
| `SEVERE_WEATHER` | Tornado warnings, severe storms, extreme heat. |
| `ALL_HANDS` | Critical event-wide announcement (evacuation, etc.). |
| `GEAR_RETURN` | End-of-event gear return reminders. Operational, low urgency. |

If you need more topics, ping me — adding one requires a schema change on
Inventory and a redeploy.

## Subscriber lifecycle

- **Sign-up**: Anyone at the event scans a QR poster (the URL is
  `/events/<eventId>/alert-signup`). It's a public page — no login required.
  They pick which topics they want. Their phone receives a confirmation SMS.
- **Per-event**: Each subscription is scoped to one event. A person signing up
  for Lifest 2026 won't receive Lifest 2027 alerts unless they re-scan.
- **STOP**: Replying STOP to any Medics WI alert text marks them stopped on
  every active subscription (handled by the Twilio inbound webhook).
- **Re-subscribe**: Re-scanning the QR (or hand-adding) clears the stopped flag
  and refreshes their consent timestamp.

## Suggested Ops Hub UX

Three views:

1. **Event picker** → calls `GET /api/events?status=ACTIVE`.
2. **Topic-count tiles** → calls `GET /api/alert-subscribers?eventId=...` per
   topic, shows live counts. Dispatcher picks a topic.
3. **Compose & confirm** → text area, type-the-event-name confirmation,
   submit button calling `POST /api/alerts/broadcast`. After success, show
   the queued/failed counts and a link back to the inventory audit log.

## Permissions on the Ops Hub side

Inventory only cares about the shared API key. It is the **Ops Hub's job** to
gate this UI to roles like `dispatcher`, `supervisor`, or whatever you call
them. From Inventory's perspective, every Ops Hub call is "trusted server" —
audit row will tag it with whatever you put in `X-OpsHub-Actor`.

## Error responses

All endpoints return JSON `{ "error": "...message..." }` with the appropriate
HTTP status.

| Status | Meaning |
| --- | --- |
| 400 | Validation error (missing fields, invalid phone, confirm name mismatch). |
| 401 | Bearer key missing or wrong. |
| 404 | Event or subscriber not found. |
| 500 | Twilio not configured on the Inventory deploy. Tell me. |

## Smoke test

After Ops Hub wires this up, dispatcher should be able to:

1. Pick the test event (use one I'll create as `Integration Test Event`).
2. See subscriber counts (I'll seed myself as a LOST_CHILD subscriber).
3. Send: topic `LOST_CHILD`, body "Ops Hub integration test — ignore", confirm name.
4. My phone gets a text.
5. The Inventory audit log shows the alert with `sentByLabel = ops-hub:<actor>`.

## Questions for the Ops Hub team

- Want a way to push subscriber updates the other way (e.g. Ops Hub creates a
  subscriber when a dispatcher takes a new call)? That's the POST endpoint above
  — let me know if you need different fields or topics.
- Want webhooks pushed back to Ops Hub on send-completion (instead of polling
  the audit endpoint)? Easy to add — I'd just need an Ops Hub URL + shared secret
  to POST to.

---

*Generated by AI. Checked Once by Brian: Be sure to check for accuracy.*
