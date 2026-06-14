# Daily overview — `GET /overview`

Phase 9. A roll-up of one day's events (R-VIEW-1) computed from daily aggregates (R-PAT-2).
Composite supplements are expanded into per-ingredient amounts (R-PAT-5), so the day's ingredient
totals are real — e.g. "magnesium 400 mg" from a 2-serving stack.

## Request

```
GET /overview?date=2026-06-13&tzOffsetMinutes=120
Authorization: Bearer <INGEST_TOKEN>
```

- `tzOffsetMinutes` — optional, the client's **east-positive** UTC offset
  (`-new Date().getTimezoneOffset()`, e.g. UTC+2 → `120`); defaults to `0` (UTC).
- `date` — optional `YYYY-MM-DD`; defaults to the user's **local today** (computed with
  `tzOffsetMinutes`). Day boundaries are **local** midnight: `[date 00:00 local,
  +24h)`, i.e.
  `date 00:00 − tzOffsetMinutes` in UTC. So an event logged at 12:30am local lands on that local
  day, not the UTC one.

Returns `200`:

```json
{
  "date": "2026-06-13",
  "eventCount": 7,
  "byCategory": { "drink": 2, "sleep": 1, "mood": 2, "supplement": 1, "workout": 1 },
  "subjective": {
    "mood": {
      "avg": 3,
      "n": 2,
      "points": [
        { "at": "2026-06-13T09:00:00.000Z", "rating": 4 },
        { "at": "2026-06-13T15:00:00.000Z", "rating": 2 }
      ]
    }
  },
  "caffeineMg": 210,
  "lastCaffeineAt": "2026-06-13T14:00:00.000Z",
  "sleepMinutes": 420,
  "workout": { "count": 1, "durationMin": 45 },
  "ingredients": [{ "canonical_name": "magnesium glycinate", "amount": 400, "unit": "mg" }],
  "products": [
    {
      "name": "sleep stack",
      "ingredients": [
        {
          "name": "Magnesium Glycinate",
          "amount": 200,
          "unit": "mg",
          "canonical_name": "magnesium glycinate"
        }
      ]
    }
  ]
}
```

`400` on a malformed `date`; `401` bad token; `405` non-GET.

## What it computes

- **caffeineMg / lastCaffeineAt** — sum of `fields.caffeine_mg` across the day + the latest time one
  was logged. (Caffeine that's an _ingredient_ of a product shows in `ingredients`, not here.)
- **sleepMinutes** — sum of `fields.duration_min` for `sleep` events.
- **workout** — count + total `duration_min`.
- **subjective** — per dimension (mood / energy / focus): `avg`, `n`, and `points` (each rating with
  its time, oldest first) so the client can **plot** the day's check-ins.
- **ingredients** — every logged product expanded (`servings × per-ingredient amount`,
  [`expandToIngredients`](../src/products.ts)) and summed by canonical name + unit (kept for
  ingredient-level analysis, R-PAT-5).
- **products** — the day's composite supplements **by name**, each with its ingredient list. The UI
  shows the names (clickable to reveal ingredients) rather than the summed `ingredients` rollup.
- **byCategory** — event counts per category.

Logic lives in [`src/aggregate.ts`](../src/aggregate.ts) (pure, unit-tested); the handler
([`functions/overview/index.ts`](../functions/overview/index.ts)) does the day windowing, fetches
ingredient lists + names for the day's products, and adds `products`.

## In the app

The web UI's **Overview** tab calls this on open (and after any log) and renders the summary, a
mood/energy/focus line chart from `subjective.*.points`, and the supplement names (tap one for an
ingredients pop-up). Run locally with `deno task serve:overview` (or `deno task start`).

## Curl

```sh
curl -s "http://localhost:8000/overview?date=2026-06-13" \
  -H "authorization: Bearer $INGEST_TOKEN" | python3 -m json.tool
```

## Not yet (future)

- **Weekly / monthly** trends + correlations — Phase 10.
- ~~A full **event timeline** list view — needs a `GET /events` list endpoint.~~ Done (Phase 11d):
  `GET /events` lists events newest-first; the PWA's **Timeline** card renders it.
