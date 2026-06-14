# Deploy — Deno Deploy + Supabase

The backend runs as **one Deno service** ([`main.ts`](../main.ts)) on **Deno Deploy**, talking to a
**Supabase Postgres** database. See [ADR-011](../../docs/ARCHITECTURE.md#adr-011).

```
iOS Shortcuts ──HTTPS──▶ https://<project>.deno.dev/{events,capture,quicklog,...}  (Deno Deploy)
                                            │
                                            ▼ DATABASE_URL
                                   Supabase Postgres (system of record)
```

You'll do this once. Exact dashboard wording may shift — the steps are stable.

## 0. Prerequisites

- This repo on GitHub (done).
- A **Supabase** account (free) — supabase.com.
- A **Deno Deploy** account (free) — dash.deno.com (sign in with GitHub).
- Deno installed locally (for the one-time migration step).

## 1. Create the Supabase project

1. Supabase dashboard → **New project**. Pick a name, a strong DB password (save it), a region near
   you.
2. Wait for it to provision (~2 min).

## 2. Get the database connection string

Project → **Settings → Database → Connection string → "Connection pooling"**. Use the
**Transaction** pooler URI (host ends in `pooler.supabase.com`, port **6543**) — it's built for many
short-lived serverless connections. Insert your DB password where it says `[YOUR-PASSWORD]`. This
whole URI is your `DATABASE_URL`.

> Our driver is configured with `prepare: false`, so the transaction pooler works out of the box.
> (The session pooler / direct connection also work if you prefer.)

## 3. Create the schema (one-time, from your laptop)

```sh
cd backend
DATABASE_URL="postgres://...pooler.supabase.com:6543/postgres" deno task migrate
# optional: add example quick-log templates
DATABASE_URL="..." deno task templates:seed
```

Re-run `migrate` whenever a new migration lands (it's idempotent). **Never run `deno task test`,
`seed`, or `templates:seed` against this URL casually** — `test` is destructive and `seed` writes
sample rows into your real data.

## 4. Make an ingest token

A shared secret your Shortcuts present so randoms can't write to your log:

```sh
openssl rand -hex 32
```

Keep it; you'll set it as `INGEST_TOKEN` below and in your Shortcuts.

## 5. Deploy to Deno Deploy

**Dashboard (recommended):**

1. dash.deno.com → **New Project** → **Deploy from GitHub** → pick `aerohit/TrackEverything`.
2. Set the **entrypoint** to `backend/main.ts`. Production branch: `main`.
3. Add **Environment Variables**:
   - `DATABASE_URL` — the pooler URI from step 2
   - `INGEST_TOKEN` — the token from step 4
   - `ANTHROPIC_API_KEY` — your Anthropic key (enables `/capture`, `/ingredient-scan`, `/ask`)
   - `CLAUDE_MODEL` — optional; set `claude-haiku-4-5` to cut LLM cost
4. Deploy. You get a URL like `https://trackeverything-xxxx.deno.dev`.

**CLI alternative:** `deno install -gA jsr:@deno/deployctl`, then from `backend/`:
`deployctl deploy --project=<name> --entrypoint=main.ts` (set the env vars in the dashboard).

## 6. Verify

```sh
BASE="https://<your-project>.deno.dev"
curl -s "$BASE/health"                                   # {"ok":true,...}

curl -s -X POST "$BASE/checkin" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $INGEST_TOKEN" \
  -d '{"mood":4,"energy":3,"focus":4}'                    # 201 with 3 events
```

A `401` means the token's wrong; a `503` on `/ask` means `ANTHROPIC_API_KEY` isn't set.

## 7. Point your Shortcuts at it

In every Shortcut, use `https://<your-project>.deno.dev` as the base URL and send
`Authorization: Bearer <INGEST_TOKEN>`. The request bodies are exactly as in
[manual-capture.md](manual-capture.md), [voice-capture.md](voice-capture.md),
[quick-log.md](quick-log.md), [composite-supplements.md](composite-supplements.md),
[check-ins.md](check-ins.md), and [real-time-analysis.md](real-time-analysis.md) — just swap
`http://localhost:8000` for your deploy URL.

## Where credentials live

- **Production secrets** (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `INGEST_TOKEN`) live **only in Deno
  Deploy's env settings**. Never commit them; never put the prod `DATABASE_URL` in `backend/.env`.
- **Local/test** uses a throwaway Postgres and your gitignored `backend/.env`.
- See the README "Environments & credentials" section for the full split.

## Cold starts & warm-up

Deno Deploy is serverless: a deploy (or a few minutes idle) evicts the warm isolate, so the **first
request after that pays a cold start** — boot the isolate, open a fresh TLS+auth connection to
Supabase, then query. Two things keep this small:

- **Startup connection warm** — [`main.ts`](../main.ts) fires a non-blocking `select 1` at boot, so
  the DB handshake overlaps with the isolate starting rather than blocking the first request.
- **Warm-up workflow** — [`.github/workflows/warmup.yml`](../../.github/workflows/warmup.yml) pings
  `GET /health?warm=1` (which runs a `select 1`) **hourly**, **after each push to `main`**, and on
  manual dispatch. This keeps the pooled connection warm and, crucially, **prevents the Supabase
  7-day pause**. Override the target with a repo variable `APP_URL` if your deploy URL differs.
  - _Caveat:_ GitHub runners are US-based, so the cron warms whichever Deno region is nearest them
    (not necessarily yours) — it reliably prevents the Supabase pause, but to keep _your_ region's
    isolate warm too, point an uptime monitor (e.g. cron-job.org / UptimeRobot, in your region) at
    the same `/health?warm=1` URL.
- **Region co-location matters most.** Every query crosses the network between the Deno region
  serving you and the Supabase region. Check the Deno region via the `via:` response header
  (`curl -sD - .../health -o /dev/null | grep -i ^via:`) and the Supabase region in the dashboard or
  the pooler host (`aws-0-<region>.pooler.supabase.com`); keep them on the same continent.
  - In the Deno console → app **Settings → Deployment Region**, **pin a single region near
    Supabase** (e.g. `ams` for a `eu-west` database). "All Regions" can serve a request from a far
    region (e.g. `ord`/Chicago) that then makes every DB round-trip cross an ocean — which, on a
    stale pooled connection, surfaces as `canceling statement due to statement timeout`.

## Isolate resilience (don't crash on a bad query)

A Deno Deploy isolate that throws an **uncaught promise rejection crashes and reboots** — and the
next request pays a cold start, often a `503 DEPLOYMENT_TIMED_OUT`. We saw exactly this in the logs:
a dropped/stale pooled connection produced an _uncaught_
`PostgresError: canceling statement due to
statement timeout`, crash-looping the production isolate.
Two safeguards in code:

- [`main.ts`](../main.ts) installs a global `unhandledrejection` handler that logs and swallows
  stray rejections, so one bad DB result can't take the service down.
- [`db.ts`](../src/db.ts) sets `connect_timeout`, `idle_timeout`, and `max_lifetime` so the driver
  **fails fast** and **recycles** the connection instead of reusing a half-open socket.

## Preview deployments share production env

Deno Deploy **builds every push to the repo** (a preview deployment per branch). By default env vars
have **context "All"**, so a preview inherits the **production `DATABASE_URL`** and would hit the
real database if it received traffic. CI (GitHub Actions) is unaffected — it uses its own throwaway
Postgres. To isolate previews, set `DATABASE_URL` (at least) to a **Production-only** context in the
console, or turn off branch/preview builds; merging to `main` still triggers the production deploy.

## Good to know

- A free Supabase project **pauses after ~7 days idle** — restore it in the dashboard (data is
  kept). The hourly warm-up workflow above prevents this; daily use also avoids it.
- Cost: Deno Deploy free tier + Supabase free tier + Anthropic usage (the only real ongoing cost;
  small for one user, smaller with `claude-haiku-4-5`).
- Migrations run from your laptop against `DATABASE_URL`. There's no auto-migrate on deploy, so run
  step 3 after merging a PR that adds a migration.
