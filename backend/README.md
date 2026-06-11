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

| Command                       | What it does                                              |
| ----------------------------- | --------------------------------------------------------- |
| `deno task test`              | Unit + integration (deterministic). **Use this.**         |
| `deno task test:unit`         | Unit tests only (fully offline).                          |
| `deno task test:live`         | Hits the **real** Claude API. Needs `ANTHROPIC_API_KEY`.  |
| `deno task fmt` / `fmt:check` | Format / check formatting.                                |
| `deno task lint`              | Lint.                                                     |
| `deno task check`             | Type-check.                                               |
| `deno task serve:hello`       | Run the hello server locally (needs `ANTHROPIC_API_KEY`). |

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

## What's here (Phase 0)

```
backend/
  deno.json                 # tasks, import map, fmt/lint config
  .env.example
  src/
    config.ts               # env -> Config (pure, unit-tested)
    claude.ts               # ClaudeClient seam: Mock + Anthropic implementations
    db.ts                   # pingDatabase() connectivity check
  functions/hello/index.ts  # request -> Claude -> JSON (Edge-Function-shaped)
  tests/
    unit/                   # pure logic, offline
    integration/            # handler round-trip (mocked) + DB ping (real)
    live/                   # real Claude API, on-demand only
```

## Still manual (needs your accounts)

- **Supabase project** — create a dev project at supabase.com when we start Phase 1; put its
  `DATABASE_URL` in `.env`. Not required for Phase 0 tests.
- **GitHub remote + push** — push this repo so the CI workflow runs and you get the green badge that
  closes out Phase 0.
- **Anthropic key** — only needed to run `deno task test:live` or the server.
