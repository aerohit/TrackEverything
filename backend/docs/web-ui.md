# Web UI (PWA) — the iPhone app

Phase 11. A self-contained mobile web page ([`ui/app.ts`](../ui/app.ts)) the backend serves at
**`/`** and **`/app`**. It's the primary iPhone UI — added to the Home Screen it runs full-screen
like a native app, with no App Store, signing, or Apple Developer account. See
[ADR-012](../../docs/ARCHITECTURE.md#adr-012).

```
Safari → https://<your-app>.deno.dev/  →  Share → Add to Home Screen  →  full-screen app
                 │ same-origin fetch with INGEST_TOKEN (kept in localStorage)
                 ▼
        /checkin /quicklog /capture /events /ask /templates /products
```

## First run

Open the URL, tap the **⚙ gear**, paste your `INGEST_TOKEN`, **Save**. It's stored in the browser's
`localStorage` on that device only (same trust level as putting it in a Shortcut). A `401` from any
action re-opens the token box.

## Screens (the daily slice)

- **Today** — a daily summary (caffeine, sleep, workout, mood/energy/focus averages, ingredient
  totals) from `GET /overview`; loads on open and refreshes after a check-in or quick-log. A date
  box loads any day (Phase 9).
- **Check in** — tap a 1–5 button for mood / energy / focus (any subset), **Log check-in** →
  `POST /checkin`.
- **Quick log** — buttons built from your `/templates` and `/products`; tap one to log it →
  `POST /quicklog`.
- **Capture** — type, or tap the **mic on the iOS keyboard** and speak, then **Extract** →
  `POST /capture`. Each candidate is **editable** before saving — category, the extracted field
  values, and the **time** (a `datetime-local` picker; set it earlier to **backdate**, R-CAP-7) — or
  untick to skip it. **Save selected** → `POST /events`. (The confirmation step, R-CAP-9; an edited
  time is sent as `occurredAtConfidence: high`.)
- **Ask** — the five real-time questions → `POST /ask`; the answer shows with a count of the events
  it was based on. Two questions take a word: "Why?" (a feeling) and "Should I?" (an action).

## Add to Home Screen

Safari → **Share** → **Add to Home Screen**. The page declares `apple-mobile-web-app-capable`, so it
launches chrome-free. Re-add after you change the deploy URL.

## Run locally

```sh
cd backend
DATABASE_URL=... INGEST_TOKEN=... ANTHROPIC_API_KEY=... deno task start
# open http://localhost:8000/app
```

(`ANTHROPIC_API_KEY` is only needed for the Capture/Ask screens.)

## Not in this slice (future)

- A **timeline/history** view (needs a `GET /events` list endpoint) — Phase 11d.
- A **label-scan** screen for composite supplements (`/ingredient-scan` → `/products`) — Phase 11c.
- A **manual single-event** form and per-log option overrides (check-in note, quick-log servings) —
  Phase 11b.
- Offline queue / widgets / Apple Watch — those need a native app (R-CAP-11), still future.

## Why not native SwiftUI

See [ADR-012](../../docs/ARCHITECTURE.md#adr-012): a PWA is verifiable in our stack, ships now with
no toolchain, and matches "prove value first." Native stays an option later for the
offline/widget/Watch features a PWA can't do.
