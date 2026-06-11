# TrackEverything — backend

Phase 0 walking skeleton. Proves the toolchain end to end: an HTTP request → a Claude round-trip →
JSON out, with unit + integration tests and CI.

See [../docs/ROADMAP.md](../docs/ROADMAP.md) for the full phase plan.

## Stack

- **Runtime:** [Deno](https://deno.com/) (same runtime as Supabase Edge Functions, so functions here
  port over directly in later phases).
- **LLM:** Claude via the Anthropic SDK, behind a mockable `ClaudeClient` seam.
- **DB:** Postgres (added properly in Phase 1; here we only ping it).

## Prerequisites

- Deno 2.x — `brew install deno` (already installed if you followed Phase 0).
- That's it to run the tests. An Anthropic key and a database are optional and only needed for the
  live test and the real `hello` server.

## Run the tests (the one command)

```sh
cd backend
deno task test
```

This runs the **deterministic** suite — unit + integration — with Claude mocked and the DB test
auto-skipped if no `DATABASE_URL` is set. It needs no secrets and no network beyond fetching
dependencies the first time. This is what CI runs and what gates each phase.

Other tasks:

| Command                       | What it does                                                        |
| ----------------------------- | ------------------------------------------------------------------- |
| `deno task test`              | Unit + integration (deterministic). **Use this.**                   |
| `deno task test:unit`         | Unit tests only (fully offline).                                    |
| `deno task test:live`         | Hits the **real** Claude API. Needs `ANTHROPIC_API_KEY`.            |
| `deno task fmt` / `fmt:check` | Format / check formatting.                                          |
| `deno task lint`              | Lint.                                                               |
| `deno task check`             | Type-check.                                                         |
| `deno task migrate`           | Apply DB migrations. Needs `DATABASE_URL`.                          |
| `deno task seed`              | Migrate + insert a sample event and print it. Needs `DATABASE_URL`. |
| `deno task serve:hello`       | Run the hello server locally (needs `ANTHROPIC_API_KEY`).           |

## Configuration

Copy `.env.example` to `.env` and fill in what you need. Nothing in `.env` is required for
`deno task test`.

- `ANTHROPIC_API_KEY` — for `test:live` and the hello server.
- `DATABASE_URL` — when set, the DB integration test runs against it.
- `CLAUDE_MODEL` — defaults to `claude-opus-4-8`.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs format check, lint, type-check, and
the deterministic test suite on every push and PR, with an ephemeral Postgres so the DB test
exercises a real database. Green CI is the precondition for approving a phase. The live suite is not
run in CI.

## What's here

```
backend/
  deno.json                   # tasks, import map, fmt/lint config
  .env.example
  migrations/
    0001_event_log.sql        # events + items + templates (Phase 1)
  docs/data-dictionary.md     # category/source/field + unit conventions
  src/
    config.ts                 # env -> Config (pure, unit-tested)
    claude.ts                 # ClaudeClient seam: Mock + Anthropic implementations
    db.ts                     # connect() + pingDatabase()
    vocab.ts                  # controlled vocabularies (categories/sources/...)
    events.ts                 # event validation + insert/read repository
    migrate.ts                # tiny forward-only migration runner
  functions/hello/index.ts    # request -> Claude -> JSON (Edge-Function-shaped)
  scripts/
    migrate.ts                # deno task migrate
    insert_sample_event.ts    # deno task seed (Phase 1 acceptance helper)
  tests/
    unit/                     # pure logic, offline
    integration/              # handler round-trip (mocked) + DB roundtrips (real)
    live/                     # real Claude API, on-demand only
```

## Verifying the schema locally (optional)

The DB integration test and `deno task seed` run against any Postgres. With a local Postgres on
`localhost:5433` and a `tracktest` database:

```sh
export DATABASE_URL="postgres://postgres@localhost:5433/tracktest"
deno task seed     # migrates, inserts a sample event, prints the stored row
deno task test     # now the DB roundtrip test runs instead of skipping
```

CI does this automatically against an ephemeral Postgres, so a local DB is optional.

## Still manual (needs your accounts)

- **Supabase project** — create a dev project at supabase.com and put its `DATABASE_URL` in `.env`
  to run migrations/seed against your real database. CI proves the schema without it.
- **Anthropic key** — only needed to run `deno task test:live` or the hello server.
