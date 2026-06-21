# Deployment & environments

> **Last updated:** 2026-06-21 · **Owner:** aerohit

Three environments, each a permanent git branch that auto-deploys on push. Promotion
between them is a pull request. See [ADR-043](ARCHITECTURE.md#adr-043).

## The map

| Environment | Git branch | Deno Deploy | Supabase project | `APP_ENV` | Purpose |
| ----------- | ---------- | ----------- | ---------------- | --------- | ------- |
| TEST        | `test`     | test env / `trackeverything-test`       | `te-test`    | `test`    | break things, try ideas |
| PRE-PROD    | `preprod`  | preprod env / `trackeverything-preprod` | `te-preprod` | `preprod` | mirror prod; only working ideas |
| PROD        | `main`     | prod env / `trackeverything-prod`       | `te-prod`    | `prod`    | the real thing |

Local dev uses a throwaway local Postgres via `.env.local` (`APP_ENV=dev`).

## Day-to-day flow

1. Branch off `test`, open a PR into `test`. CI must pass.
2. Merge → `test` auto-deploys, and `migrate.yml` migrates `te-test`.
3. Promote when happy: `make promote FROM=test TO=preprod` → review the diff → merge.
   Repeat `FROM=preprod TO=main` for PROD.
4. Each merge auto-deploys that environment and runs its migrations.

`preprod` and `main` are protected: PR + green CI required, no direct pushes. Hotfix =
branch off `main`, PR into `main`, then back-merge `main` into `preprod` and `test`.

## Secrets & env vars

Real values live in exactly four places, none of them git:

- **Local dev** — `.env.local` (gitignored). Keys: see `.env.example`.
- **Laptop ops** — `secrets/<env>.env` (gitignored) holds each env's `DATABASE_URL` for
  `make migrate ENV=… / db-shell ENV=… / seed-products ENV=…`.
- **Runtime** — Deno Deploy env vars, per environment (mark `DATABASE_URL`, `INGEST_TOKEN`,
  `ANTHROPIC_API_KEY` as **secret**; `APP_ENV`, `CLAUDE_MODEL` are plain).
- **CI / migrations** — GitHub **Environment** secrets (`test` / `preprod` / `prod`), used by
  `migrate.yml`.

`.env.example` is the only committed env file (names + dummy values). CI's `secrets` job
fails the build if any real `.env` or `secrets/` file is ever tracked.

---

## One-time setup checklist (manual — console clicks)

### A. Supabase — 3 projects

1. Create projects `te-test`, `te-preprod`, `te-prod`.
   - Free tier allows 2 active projects per org. To get 3 free, put `te-test` in a second
     org (or on Neon); keep `te-preprod` + `te-prod` together so pre-prod mirrors prod.
   - **Make `te-preprod` identical to `te-prod`**: same region, Postgres version, and
     pooler mode. This is what makes pre-prod trustworthy.
2. For each, copy the **transaction-pooler** connection string (port `6543`) — that's the
   `DATABASE_URL` for that environment.
3. (Per project) ensure the `pg_trgm` extension is available — the migrations create the
   trigram index; Supabase ships `pg_trgm`, so no action usually needed.

### B. GitHub — Environments (for CI migrations)

`Settings → Environments` → create `test`, `preprod`, `prod`. For each, add a secret
`DATABASE_URL` = that env's Supabase pooled URL.
- Optionally add **required reviewers** on `prod` — then a prod migration pauses for your
  approval before it runs. Recommended.

### C. Deno Deploy (console.deno.com) — 3 environments

Two ways; pick one:
- **Simplest:** three projects (`trackeverything-test/-preprod/-prod`), each git-linked to
  its branch (`test`/`preprod`/`main`).
- **Or:** one app with three environments, each mapped to its branch (if your plan supports
  per-environment env vars).

For each, set:
- **Production branch / trigger:** the matching git branch.
- **Build:** install `cd web && npm ci`, build `npm run build`; **entrypoint** `server/main.ts`.
- **Env vars:** `DATABASE_URL` (secret), `INGEST_TOKEN` (secret), `ANTHROPIC_API_KEY`
  (secret, optional), `APP_ENV` (`test`/`preprod`/`prod`), `CLAUDE_MODEL` (optional).
- Note each env's URL; set the warm-up workflow's `APP_URL` var to PROD's.

### D. Branches & protection

```bash
# from an up-to-date main, create the two env branches at the same point
git switch main && git pull
git switch -c preprod && git push -u origin preprod
git switch main && git switch -c test && git push -u origin test
```
Then in `Settings → Branches`, protect `main` and `preprod`: require a PR + the CI checks,
disallow direct pushes.

### E. First fill of each database

```bash
# create secrets/test.env etc. with DATABASE_URL=…  (gitignored)
make migrate ENV=test          # schema (incl. the seeded substance catalog, migration 0014)
make seed-products ENV=test    # grocery product catalog
# repeat for preprod and prod
```

That's it — from here, merging a PR into a branch deploys + migrates that environment.
