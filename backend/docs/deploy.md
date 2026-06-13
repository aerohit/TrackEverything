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

## Good to know

- A free Supabase project **pauses after ~7 days idle** — restore it in the dashboard (data is
  kept). Daily use generally avoids this.
- Cost: Deno Deploy free tier + Supabase free tier + Anthropic usage (the only real ongoing cost;
  small for one user, smaller with `claude-haiku-4-5`).
- Migrations run from your laptop against `DATABASE_URL`. There's no auto-migrate on deploy, so run
  step 3 after merging a PR that adds a migration.
