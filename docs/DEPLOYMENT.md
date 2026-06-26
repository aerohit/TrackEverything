# Deployment & environments

> **Last updated:** 2026-06-22 · **Owner:** aerohit

Two environments, each a permanent git branch that auto-deploys on push. Promotion is a
pull request. See [ADR-043](ARCHITECTURE.md#adr-043).

## The map

| Environment | Git branch | Deno Deploy | Supabase project | `APP_ENV` | Purpose |
| ----------- | ---------- | ----------- | ---------------- | --------- | ------- |
| TEST | `test` | test env / `trackeverything-test` | `te-test` | `test` | break things, try ideas, shake out before prod |
| PROD | `main` | prod env / `trackeverything-prod` | `te-prod` | `prod`  | the real thing |

Local dev uses a throwaway local Postgres via `.env.local` (`APP_ENV=dev`).

## Day-to-day flow

1. Branch off `test`, open a PR into `test`. CI must pass.
2. Merge → `test` auto-deploys, and `migrate.yml` migrates `te-test`.
3. When it's been exercised and looks good, promote: `make promote FROM=test TO=main` →
   review the diff → merge. `main` auto-deploys and migrates `te-prod`.

`main` is protected: PR + green CI required, no direct pushes. Hotfix = branch off `main`,
PR into `main`, then back-merge `main` into `test`.

## Secrets & env vars

Real values live in exactly four places, none of them git:

- **Local dev** — `.env.local` (gitignored). Keys: see `.env.example`.
- **Laptop ops** — `secrets/<env>.env` (gitignored) holds each env's `DATABASE_URL` for
  `make migrate ENV=… / db-shell ENV=… / seed-products ENV=…`.
- **Runtime** — Deno Deploy env vars, per environment (mark `DATABASE_URL`, `INGEST_TOKEN`,
  `ANTHROPIC_API_KEY` as **secret**; `APP_ENV`, `CLAUDE_MODEL` are plain).
- **CI / migrations** — GitHub **Environment** secrets (`test` / `prod`), used by `migrate.yml`.

`.env.example` is the only committed env file (names + dummy values). CI's `secrets` job
fails the build if any real `.env` or `secrets/` file is ever tracked.

---

## One-time setup checklist (manual — console clicks)

### A. Supabase — 2 projects

1. Create projects `te-test` and `te-prod` (same region + Postgres version, so test is a
   faithful rehearsal of prod).
2. For each, copy the **transaction-pooler** connection string (port `6543`) — that's the
   `DATABASE_URL` for that environment.
3. `pg_trgm` is shipped by Supabase; the migrations create the trigram index, so no action
   is usually needed.

### B. GitHub — Environments (for CI migrations)

`Settings → Environments` → create `test` and `prod`. For each, add a secret `DATABASE_URL`
= that env's Supabase pooled URL.
- Optionally add **required reviewers** on `prod` — then a prod migration pauses for your
  approval before it runs. Recommended.

### C. Deno Deploy (console.deno.com) — 2 environments

Two ways; pick one:
- **Simplest:** two projects (`trackeverything-test` / `-prod`), each git-linked to its
  branch (`test` / `main`).
- **Or:** one app with two environments mapped to those branches (if your plan supports
  per-environment env vars).

For each, set:
- **Production branch / trigger:** the matching git branch.
- **Build:** install `cd web && npm ci`, build `npm run build`; **entrypoint** `server/main.ts`.
- **Env vars:** `DATABASE_URL` (secret), `INGEST_TOKEN` (secret), `ANTHROPIC_API_KEY`
  (secret, optional), `APP_ENV` (`test` / `prod`), `CLAUDE_MODEL` (optional).
- Note each env's URL; set the warm-up workflow's `APP_URL` var to PROD's.

### D. Branches & protection

```bash
# create the test branch at main's current point
git switch main && git pull
git switch -c test && git push -u origin test
```
Then in `Settings → Branches`, protect `main`: require a PR + the CI checks, disallow direct
pushes.

### E. First fill of each database

```bash
# create secrets/test.env etc. with DATABASE_URL=…  (gitignored)
make migrate ENV=test          # schema (incl. the seeded substance catalog, migration 0014)
make seed-products ENV=test    # grocery product catalog
# repeat for prod
```

That's it — from here, merging a PR into a branch deploys + migrates that environment.
