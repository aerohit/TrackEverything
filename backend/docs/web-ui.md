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

## Look & feel

A dark **"Aurora"** theme: an indigo→cyan gradient glow behind near-black, frosted-glass cards, a
gradient app title, and gradient/glowing primary buttons and selected rating chips. It's pure CSS in
[`ui/app.ts`](../ui/app.ts) (no assets, no build step) — the markup and behaviour are unchanged.

## First run

Open the URL, tap the **⚙ gear**, paste your `INGEST_TOKEN`, **Save**. It's stored in a **cookie**
(plus `localStorage` as a fallback) on that device only (same trust level as putting it in a
Shortcut) — the cookie survives reloads and app relaunches even where an iOS standalone PWA clears
`localStorage`. A `401` from any action re-opens the token box.

## Screens

The app is organised into **four tabs** (a bottom nav bar); the active screen shows, the others are
hidden client-side (no routing/build step — it's one page that toggles `.screen` sections):

- **Home** — the capture loop you use all day: **Check in**, **Capture**, **Photo food**, **Quick
  log**, **Log manually**.
- **Overview** — read-only views: **Today**, the **Timeline**, and a **Weekly** placeholder for the
  reports coming in Phase 10. Refreshes when you open the tab.
- **Ask** — the real-time questions.
- **Manage** — set-up you reach rarely: products, label scan, templates, ingredient breakdown.

The cards within each tab:

- **Today** (Overview) — a daily summary of **actions/inputs** (caffeine, sleep, workout,
  **calories + P/C/F macros**, composite supplements by name — tap a name for an ingredients pop-up)
  from `GET /overview`, for the **local** day (the UI sends its UTC offset). A date box loads any
  day (Phase 9). Perceptions (mood/energy/focus) are **not** here — they're the chart's job (see
  [ADR-014](../../docs/ARCHITECTURE.md#adr-014)).
- **Mood · energy · focus** (Overview) — a dedicated card with the day's averages and a **line
  chart** of the check-ins (from `subjective.*.points`), or a hint when there were none. This is the
  _only_ place perceptions appear (ADR-014).
- **Timeline** (Overview) — a newest-first list of recent **actions/inputs** from `GET /events`
  (time, category, fields, source, and the note if one was added); the perception categories
  (mood/energy/focus) are filtered out (ADR-014). **Food** rows are shown as a simple **"Meal —
  dish"** (e.g. "Lunch — Salad"), not the raw ingredient list — the dish name is a **link** that
  opens an ingredients pop-up (with a meal · calories · P/C/F subtitle) (R-VIEW-5). It
  **auto-refreshes after every log**; **Refresh** reloads it (Phase 11d, R-VIEW-4).
- **Check in** (Home) — tap a 1–5 button for mood / energy / focus (any subset), add an optional
  **note**, **Log check-in** → `POST /checkin`.
- **Photo food** — pick a **meal** (pre-filled by time), take/choose a meal photo, **Scan food** →
  `POST /food-scan` (Claude vision). The scan also guesses a dish-level **`item`** name (e.g.
  "salad", "pizza") used as the timeline label. Each recognised food is an **editable** row — name,
  **amount + unit** (changing the amount rescales calories/macros), **calories** (or type one in to
  override), **P / C / F**, and a tap-to-open **ingredients** pop-up (context). **Save foods** → one
  `food` event per item (`source: photo`). Nutrition is LLM-estimated (Phase 12, R-CAP-16).
- **Quick log** — buttons built from your `/templates` and `/products`; tap one to log it →
  `POST /quicklog`. **Options…** reveals a **servings** (scales a product's dose) and a **fields**
  override (`caffeine_mg=95, item=decaf`) applied to subsequent taps (Phase 11b).
- **Log manually** — pick a category, add field key/value rows, optionally set a **time** (blank =
  now, earlier = backdated), **Log event** → a single `POST /events` (`source: manual`). Numeric
  values are stored as numbers (Phase 11b).
- **Capture** — type, or tap the **mic on the iOS keyboard** and speak, then **Extract** →
  `POST /capture`. Each candidate is **editable** before saving — category, the extracted field
  values, and the **time** (a `datetime-local` picker; set it earlier to **backdate**, R-CAP-7) — or
  untick to skip it. **Save selected** → `POST /events`. (The confirmation step, R-CAP-9; an edited
  time is sent as `occurredAtConfidence: high`.)
- **Ask** — the five real-time questions → `POST /ask`. A **Window** control (24/48/72h) sets the
  look-back (`windowHours`); the answer shows with the **specific cited events** (time, category,
  fields) it reasoned from, not just a count (Phase 11d). Two questions take a word: "Why?" (a
  feeling) and "Should I?" (an action).
- **Manage** (Phase 11c) — set-up surfaces you reach rarely:
  - **New product** — name + category + ingredient rows → `POST /products`. **Scan label →
    ingredients** sends a photo to `POST /ingredient-scan` (Claude vision) and fills the rows for
    you to confirm/edit (the R-CAP-15 image path in the UI).
  - **New template** — name + category + a `key=value` fields string → `POST /templates`.
  - **Ingredient breakdown** — a product name + servings → `GET /products?name&servings`, showing
    the expanded per-ingredient amounts (R-PAT-5).

  Saving a product or template refreshes the **Quick log** buttons immediately.

## Add to Home Screen

Safari → **Share** → **Add to Home Screen**. The page declares `apple-mobile-web-app-capable`, so it
launches chrome-free. Re-add after you change the deploy URL.

## Run locally

```sh
cd backend
DATABASE_URL=... INGEST_TOKEN=... ANTHROPIC_API_KEY=... deno task start
# open http://localhost:8000/app
```

(`ANTHROPIC_API_KEY` is only needed for the Capture, Photo food, and Ask features.)

## Not in this slice (future)

- Offline queue / widgets / Apple Watch — those need a native app (R-CAP-11), still future.

## Why not native SwiftUI

See [ADR-012](../../docs/ARCHITECTURE.md#adr-012): a PWA is verifiable in our stack, ships now with
no toolchain, and matches "prove value first." Native stays an option later for the
offline/widget/Watch features a PWA can't do.
