# Daily overview — `GET /overview`

Phase 9. A roll-up of one day's events (R-VIEW-1) computed from daily aggregates (R-PAT-2).
Composite supplements are expanded into per-ingredient amounts (R-PAT-5), so the day's ingredient
totals are real — e.g. "magnesium 400 mg" from a 2-serving stack.

## Request

```
GET /overview?date=2026-06-13
Authorization: Bearer <INGEST_TOKEN>
```

- `date` — optional `YYYY-MM-DD`; defaults to **today (UTC)**. Day boundaries are
  `[date 00:00Z, +24h)`. (Local-timezone days are a later refinement.)

Returns `200`:

```json
{
  "date": "2026-06-13",
  "eventCount": 7,
  "byCategory": { "drink": 2, "sleep": 1, "mood": 2, "supplement": 1, "workout": 1 },
  "subjective": { "mood": { "avg": 3, "n": 2 } },
  "caffeineMg": 210,
  "lastCaffeineAt": "2026-06-13T14:00:00.000Z",
  "sleepMinutes": 420,
  "workout": { "count": 1, "durationMin": 45 },
  "ingredients": [{ "canonical_name": "magnesium glycinate", "amount": 400, "unit": "mg" }]
}
```

`400` on a malformed `date`; `401` bad token; `405` non-GET.

## What it computes

- **caffeineMg / lastCaffeineAt** — sum of `fields.caffeine_mg` across the day + the latest time one
  was logged. (Caffeine that's an _ingredient_ of a product shows in `ingredients`, not here.)
- **sleepMinutes** — sum of `fields.duration_min` for `sleep` events.
- **workout** — count + total `duration_min`.
- **subjective** — average + count of `fields.rating` for mood / energy / focus.
- **ingredients** — every logged product expanded (`servings × per-ingredient amount`,
  [`expandToIngredients`](../src/products.ts)) and summed by canonical name + unit.
- **byCategory** — event counts per category.

Logic lives in [`src/aggregate.ts`](../src/aggregate.ts) (pure, unit-tested); the handler
([`functions/overview/index.ts`](../functions/overview/index.ts)) does the day windowing and fetches
ingredient lists for the day's products.

## In the app

The web UI's **Today** card calls this on load (and after a check-in / quick-log) and renders the
summary. Run locally with `deno task serve:overview` (or `deno task start` for the whole app).

## Curl

```sh
curl -s "http://localhost:8000/overview?date=2026-06-13" \
  -H "authorization: Bearer $INGEST_TOKEN" | python3 -m json.tool
```

## Not yet (future)

- **Local-timezone** day boundaries (currently UTC).
- **Weekly / monthly** trends + correlations — Phase 10.
- ~~A full **event timeline** list view — needs a `GET /events` list endpoint.~~ Done (Phase 11d):
  `GET /events` lists events newest-first; the PWA's **Timeline** card renders it.
