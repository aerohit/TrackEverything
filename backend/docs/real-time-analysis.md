# Real-time analysis — `POST /ask`

Phase 6. Ask a question about your recent state; Claude reasons over your last 24–48h timeline and
answers, **citing the specific events it used** (R-RT-3, R-RT-6). The whole window fits in context,
so there's no statistics step here — that's the retrospective phases. Phase 6 ships one question;
Phase 7 adds the rest.

```
POST /ask ─▶ fetch recent events ─▶ assemble citable timeline ([E#]) ─▶ Claude ─▶ {answer, citedEvents}
```

## Request

```
POST /ask
Authorization: Bearer <INGEST_TOKEN>

{ "question": "whats_dragging_me_down", "windowHours": 48 }
```

- `question` — a template id (default `whats_dragging_me_down`). Unknown ids get a `400` listing the
  available ones.
- `windowHours` — optional, default 48, capped at 72.

Returns `200`:

```json
{
  "answer": "Your energy dip lines up with 5h41m sleep and a 4pm coffee...",
  "citedEvents": [{ "ref": "E3", "id": "…", "category": "sleep" }],
  "unmatchedCitations": [],
  "windowHours": 48
}
```

Each event in the assembled timeline is tagged `[E#]`; the model cites those tags and we resolve
them back to event ids, so every claim is traceable to a logged event. Needs `DATABASE_URL` +
`ANTHROPIC_API_KEY` server-side.

## Try it with curl

```sh
curl -sS -X POST http://localhost:8000/ask \
  -H "content-type: application/json" -H "authorization: Bearer $INGEST_TOKEN" \
  -d '{"question":"whats_dragging_me_down"}'
```

Run locally with `deno task serve:ask`. Set `CLAUDE_MODEL=claude-haiku-4-5` for a cheaper (if
blunter) answer.

## How it's grounded

- **Window:** `src/context.ts` selects events in `[now − windowHours, now]`, oldest first, and
  formats each as `[E#] <time> <category> <fields>`.
- **Citations:** `src/ask.ts` instructs the model to answer only from the timeline and cite `[E#]`
  tags; `resolveCitations` maps them back to events (anything it can't match lands in
  `unmatchedCitations`).
- **Baselines:** the assembler accepts optional personal baselines (e.g. "usual: ~2 coffees, sleep
  ~7h"); not yet wired to a source — a later refinement.

## Verifying the real model

The deterministic tests mock Claude. To check the prompt actually produces a grounded, citing
answer, run `deno task test:live` with `ANTHROPIC_API_KEY` — it reasons over a fixed timeline and
asserts a non-empty answer with ≥1 citation.
