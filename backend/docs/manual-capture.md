# Manual capture — `POST /events`

Phase 2. Log a structured event over HTTP with no LLM in the path. This is the endpoint the iOS
Shortcut (and later the app) calls.

## Request

```
POST /events
Content-Type: application/json
Authorization: Bearer <INGEST_TOKEN>        # or:  x-ingest-token: <INGEST_TOKEN>

{
  "category": "drink",                       // required; see data dictionary
  "occurredAt": "2026-06-12T08:00:00Z",      // required; ISO-8601
  "source": "manual",                        // optional; defaults to "manual"
  "occurredAtConfidence": "inferred",        // optional; "high" (default) | "inferred"
  "recordedAt": "2026-06-12T11:00:00Z",      // optional; defaults to now
  "fields": { "item": "coffee", "caffeine_mg": 120 },  // optional object
  "rawText": "had my coffee earlier"         // optional
}
```

Responses: `201` with the stored row; `400` `{error, details}` on a bad payload; `401` if the token
is missing/wrong; `405` for non-POST.

## Try it with curl

Against a locally running server (`deno task serve:events`, with `DATABASE_URL` and optionally
`INGEST_TOKEN` set):

```sh
curl -sS -X POST http://localhost:8000/events \
  -H "content-type: application/json" \
  -H "authorization: Bearer $INGEST_TOKEN" \
  -d '{"category":"drink","occurredAt":"2026-06-12T08:00:00Z","fields":{"item":"coffee","caffeine_mg":120}}'
```

(Drop the `authorization` header if `INGEST_TOKEN` is unset.)

## iOS Shortcut (manual entry)

Build once on the phone; no app needed. A minimal "Log event" Shortcut:

1. **Text** actions (or **Ask Each Time**) to gather `category` and an optional note.
2. **Dictionary** action — build the JSON body:
   - `category` → (your text / a fixed value)
   - `occurredAt` → **Current Date** formatted as ISO-8601
   - `fields` → a sub-dictionary (e.g. `item`, `caffeine_mg`)
   - `rawText` → the note
3. **Get Contents of URL**:
   - URL: your deployed function URL (e.g. `https://<project>.functions.supabase.co/events`)
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <INGEST_TOKEN>`, `Content-Type` = `application/json`
   - Request Body: **JSON** = the Dictionary from step 2
4. (Optional) **Show Result** to confirm the `201` response.

Add the Shortcut to the Home/Lock Screen or trigger it with Siri. Quick-log templates ("my coffee"
with defaults) come in Phase 4 — for now each tap fills the fields in.

## Deploying to Supabase (when ready)

Deploy as an Edge Function; set `DATABASE_URL` (use the connection **pooler** string) and
`INGEST_TOKEN` as function secrets. If you rely on `INGEST_TOKEN` for auth, disable Supabase's own
JWT check for this function (`verify_jwt = false`); otherwise pass the Supabase anon key instead.
The handler is deployment-agnostic — it only needs a `Request` and a Postgres connection.
