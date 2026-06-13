# Postman collection

[`TrackEverything.postman_collection.json`](TrackEverything.postman_collection.json) covers the
entire backend HTTP API — every route the single `main.ts` router serves.

## Import & use

1. In Postman: **Import** → select the JSON file.
2. Open the collection's **Variables** and set:
   - `baseUrl` — defaults to the production deploy. Use `http://localhost:8000` for a local
     `deno task start`.
   - `ingestToken` — your `INGEST_TOKEN`. It's sent as a Bearer token on every request via the
     collection-level auth (`/health` and `/` opt out).
3. Send any request. The example bodies are ready to run; edit values as needed.

`/capture`, `/ingredient-scan`, and `/ask` also need `ANTHROPIC_API_KEY` set on the server, or they
return `503`. Requests that write (POST) hit the configured database — point `baseUrl` at a
non-production server when exploring.

## Staying in sync (binding)

This file is kept current by rule, not by hope — see the **API collection** section in the repo root
[`CLAUDE.md`](../../CLAUDE.md). Any API change updates the collection in the same change, and the
drift test [`tests/unit/postman_collection_test.ts`](../tests/unit/postman_collection_test.ts) fails
CI if a router route is missing from the collection (or vice versa). The test checks route
**coverage**; request bodies/params are reviewed by hand when they change.
