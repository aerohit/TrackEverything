# Voice capture — `POST /capture` (extract) + confirm

Phase 3. Speak (or type) freely; Claude turns the transcript into structured candidate events.
Candidates are **not saved** — the client shows them for confirmation, then persists the confirmed
ones via `POST /events` (batch). The LLM is only in the extract step; persistence stays AI-free.

```
transcript ──▶ POST /capture ──▶ { candidates: [...] } ──▶ (confirm/edit) ──▶ POST /events {events:[...]}
                (Claude extract)                              client UI            (no LLM, stores rows)
```

## 1. Extract — `POST /capture`

```
POST /capture
Content-Type: application/json
Authorization: Bearer <INGEST_TOKEN>

{ "transcript": "I had a coffee and took my magnesium at 10am" }
```

Returns `200 { "candidates": [ NewEvent, ... ] }`. Each candidate has a resolved `occurredAt` +
`occurredAtConfidence` (explicit clock times → `high`; inferred or defaulted → `inferred`),
`source: "voice"`, and `rawText` (the phrase it came from). One utterance can yield several
candidates (R-CAP-10). Errors: `400` (missing transcript / bad JSON), `401` (bad token), `405`
(non-POST).

How time is handled: the prompt is given the current time; the model emits a small time hint per
event (`now` / `absolute` ISO / `relative_minutes` / `unknown`) and
[`src/extract.ts`](../src/extract.ts) resolves it deterministically against "now".

## 2. Confirm — `POST /events` (batch)

After the user reviews/edits the candidates, persist them in one call:

```
POST /events
Authorization: Bearer <INGEST_TOKEN>

{ "events": [ <candidate>, <candidate> ] }
```

Returns `201 { "events": [ <stored row>, ... ] }`, inserted atomically. A single event (no `events`
array) still works as in Phase 2.

## Try it with curl

```sh
# Extract
curl -sS -X POST http://localhost:8000/capture \
  -H "content-type: application/json" -H "authorization: Bearer $INGEST_TOKEN" \
  -d '{"transcript":"coffee and my magnesium at 10am"}'

# ...review the candidates, then persist them
curl -sS -X POST http://localhost:8000/events \
  -H "content-type: application/json" -H "authorization: Bearer $INGEST_TOKEN" \
  -d '{"events":[ <paste edited candidates here> ]}'
```

Run locally with `deno task serve:capture` (needs `ANTHROPIC_API_KEY`, and `DATABASE_URL` for the
events server). Set `CLAUDE_MODEL=claude-haiku-4-5` to make extraction cheaper than the Opus
default.

## iOS Shortcut (voice)

Same shape as the manual Shortcut, with **Dictate Text** at the front:

1. **Dictate Text** → speak your log.
2. **Get Contents of URL** → POST `{ "transcript": <Dictated Text> }` to `/capture`.
3. Show the returned `candidates` (e.g. **Show Result** / a **List**) to confirm.
4. **Get Contents of URL** → POST `{ "events": <candidates> }` to `/events`.

Apple's dictation only has to be roughly right — the model normalizes shorthand and supplement
names. A richer confirmation/edit card comes with the native app.

## Verifying the real model

The deterministic suite mocks Claude. To check the **prompt actually produces the expected JSON**
against the real API, run `deno task test:live` with `ANTHROPIC_API_KEY` set — it extracts a sample
transcript and asserts ≥2 events with the right categories.
