# Subjective check-ins — `POST /checkin`

Phase 5. Log how you feel on a 1–5 scale across mood / energy / focus. These are the **outcome
variables** the analysis phases correlate inputs against (R-SUBJ-1). Each rating is stored as an
ordinary event (category `mood`/`energy`/ `focus`, `fields.rating`), so nothing downstream
special-cases them.

## Request

```
POST /checkin
Authorization: Bearer <INGEST_TOKEN>

{ "mood": 4 }                                  # one dimension
{ "mood": 4, "energy": 2, "focus": 3, "note": "post-lunch dip" }
{ "energy": 3, "occurredAt": "2026-06-12T08:00:00Z" }   # after-the-fact
```

Each provided rating must be an integer **1–5**; at least one of mood/energy/focus is required.
Returns `201 {events: [...]}` (one stored event per dimension, inserted atomically). `400 {details}`
on a bad rating; `401` bad token; `405` non-POST.

## Try it with curl

```sh
curl -sS -X POST http://localhost:8000/checkin \
  -H "content-type: application/json" -H "authorization: Bearer $INGEST_TOKEN" \
  -d '{"mood":4,"energy":2,"focus":3}'
```

Run locally with `deno task serve:checkin` (needs `DATABASE_URL`).

## iOS Shortcuts

**On-demand (R-SUBJ-3)** — a "How am I?" Shortcut:

1. **Ask for Input** (Number) for mood (and energy/focus if you want).
2. **Get Contents of URL** → POST `{ "mood": <Provided Input>, ... }` to `/checkin`.

**Scheduled nudge (R-SUBJ-2)** — no backend needed; iOS triggers the check-in:

- Shortcuts app → **Automation** → **Time of Day** (e.g. 9am, 1pm, 9pm) → run the check-in Shortcut.
  With "Run Immediately" + a notification you get a tap-to-rate prompt at each time.

The richer in-app experience (sliders, "rate right after an event") comes with the native app; the
event shape is identical, so it'll write to the same `/checkin`.

## Notes

- Scale is **1–5, separate** mood/energy/focus (resolves part of open question Q2).
- `source` is `manual`; the category (`mood`/`energy`/`focus`) is what marks these as subjective
  outcomes for analysis.
