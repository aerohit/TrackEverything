# Quick-log templates — `/templates` + `POST /quicklog`

Phase 4. A **template** is a named, pre-filled event ("my coffee" → drink with
`{item: coffee, caffeine_mg: 120}`). You set templates up once; then a one-tap **quicklog** expands
a template into an event at tap time (R-CAP-5, R-CAP-6).

## Manage templates — `/templates`

```
GET  /templates                          # list
POST /templates                          # create
Authorization: Bearer <INGEST_TOKEN>

{ "name": "my coffee", "category": "drink", "defaultFields": { "item": "coffee", "caffeine_mg": 120 } }
```

`GET` → `200 {templates: [...]}`. `POST` → `201` with the created template, or `400 {details}` on a
bad body. Get started fast with `deno task templates:seed` (adds "my coffee" and "my magnesium").

## One-tap log — `POST /quicklog`

```
POST /quicklog
Authorization: Bearer <INGEST_TOKEN>

{ "template": "my coffee" }                                  # log with defaults
{ "template": "my coffee", "fields": { "caffeine_mg": 80 } } # override a field
{ "template": "my coffee", "occurredAt": "2026-06-12T08:00:00Z" }  # after-the-fact
```

Returns `201` with the stored event (`source: "quicklog"`, `template_id` set, `occurredAt`
defaulting to now, per-tap `fields` merged over the template's defaults). `404` if no template by
that name; `400` if `template` is missing.

## Try it with curl

```sh
# create (or: deno task templates:seed)
curl -sS -X POST http://localhost:8000/templates \
  -H "content-type: application/json" -H "authorization: Bearer $INGEST_TOKEN" \
  -d '{"name":"my coffee","category":"drink","defaultFields":{"item":"coffee","caffeine_mg":120}}'

# one-tap log
curl -sS -X POST http://localhost:8000/quicklog \
  -H "content-type: application/json" -H "authorization: Bearer $INGEST_TOKEN" \
  -d '{"template":"my coffee"}'
```

Run locally with `deno task serve:templates` and `deno task serve:quicklog` (both need
`DATABASE_URL`).

## iOS Shortcut (one tap)

The simplest Shortcut yet — no fields to fill in:

1. **Get Contents of URL** → POST `{ "template": "my coffee" }` to `/quicklog`.
2. (Optional) **Show Result** to confirm the `201`.

Add one Shortcut per habit ("my coffee", "my magnesium") to the Home/Lock Screen, or trigger by Siri
("Hey Siri, my coffee"). A time-aware suggestion (offering your usual morning stack at 7am) is a
later refinement, not part of this phase.
