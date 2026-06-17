# TrackEverything — Roadmap (phased, gated build plan)

> **Status:** Living document. **Last updated:** 2026-06-17 (v2-C2: stacks & checklist logging)
> **Companion docs:** [REQUIREMENTS.md](REQUIREMENTS.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

Each phase is **small, independently testable, and ends in an approval gate**
(R-PROC-1, [ADR-008](ARCHITECTURE.md#adr-008)). Rules:

- A phase is **done** only when: code is written, **unit + integration tests pass
  in CI** (R-TEST-1..5), and **you have verified the acceptance criteria**.
- We **do not start the next phase** until you approve the current one.
- Every phase updates the requirement statuses it touches (`Proposed → Built`) per
  the `CLAUDE.md` rule.

Status legend: ☐ not started · ◐ in progress · ☑ approved

---

## v2 — Maturity rewrite (current)

> **Status (2026-06-15).** The MVP (Stages A–G below) is complete and deployed. The owner
> chose to mature the codebase and **redefine the data model**, keeping the same functional
> scope and infrastructure (Deno Deploy / console.deno.com + Supabase). See
> [ADR-015](ARCHITECTURE.md#adr-015) (stack: **Hono + SvelteKit + Drizzle + Zod**, one Deno
> Deploy service serving the built web + API) and [ADR-016](ARCHITECTURE.md#adr-016) (**8 typed
> per-domain entities** replace the unified event log; **clean-slate database**).
>
> **v2 went live on 2026-06-15** (Phase v2-X): the deploy entrypoint is now `server/main.ts`.
> The MVP is tagged **`v1-mvp`** and this cutover **`v2`**. Everything under the "v1 (MVP)"
> divider is kept for history. The v1 code (the `backend/` directory) has since been
> **removed** — recover it from the **`v1-mvp`** git tag if ever needed; the `backend/…`
> file links in the historical notes below point at that tag's contents.

Capture is re-modelled into **8 domains** (R-DOM-1), each its own entity, delivered one phase at
a time. Only **Subjective State** is built first (R-DOM-2); the rest are documented below.

### Phase v2-1 — Foundation + Subjective State ☑
- **Goal:** Stand up the new stack and ship the first domain end to end — check in mood/energy/focus and see them charted.
- **Delivered in two slices** (like the MVP's Phase 11): **v2-1a** — foundation + data + API (merged); **v2-1b** — the SvelteKit PWA (merged).
- **v2-1b status (merged):** the `web/` SvelteKit (Svelte 5) PWA, built to static assets and served by the Hono service as one origin. A **check-in card** (tap 1–5 for any of mood/energy/focus + optional note → `POST /api/checkins`) and a **Today** day chart (mood/energy/focus series from `GET /api/checkins`). **Responsive** — single column on phones, adaptive two-pane on desktop (R-VIEW-7) — with the **light/dark** theme carried over (R-VIEW-6). Token kept in `localStorage`. Tests: 5 Vitest unit tests (API client, chart transform) + the v2-1a server suite; `svelte-check` clean; production build green; a third CI job builds/tests `web/`. Browser-verified end to end (check-in persists, chart updates) on both wide and narrow layouts, light and dark.
- **v2-1a status (merged):** repo layout (`server/` Hono, `db/` Drizzle, `shared/` Zod; `web/` to come) + root `deno.json` + a second CI job. The `subjective_state` entity (immutable `(kind, rating)` readings — ADR-017; migration `db/migrations/0001`), typed repository, and the Hono API (`POST`/`GET /api/checkins`, token-guarded, Zod-validated) — **unit + integration tests green against real Postgres** (7 passed; the integration test covers auth, batch create sharing one `recorded_at`, list + `kind` filter + bad-param 400s, and immutability — no edit/delete route).
- **Build:**
  - **Scaffold** the new layout: `web/` (SvelteKit PWA), `server/` (Hono API + the single Deno Deploy entrypoint that also serves the built web assets), `db/` (Drizzle schema + migrations), `shared/` (Zod schemas). CI runs fmt/lint/type-check/tests; one deployable service.
  - **`subjective_state` entity** (Drizzle): immutable readings — `kind` enum (mood/energy/focus, extensible) + `rating` 1–5 + optional `note` + `recorded_at`; shared Zod schema (ADR-017).
  - **API** (Hono): record a check-in (one or more readings) and list readings (with a `kind` filter) — Zod-validated, create + read only.
  - **PWA** (SvelteKit): a check-in card (tap 1–5 for any of mood/energy/focus + optional note) and a day view with the line chart; carry over the light/dark theme; responsive (adaptive two-pane on desktop).
- **Tests:** unit (Zod validation, entity repo, chart pure fns); integration (HTTP → DB roundtrip for create/list, filters, immutability); a UI build + smoke check.
- **You verify:** check in mood/energy/focus on the deployed preview and see the day chart.
- **Builds:** R-DOM-1, R-DOM-2; the v2 realisation of R-SUBJ-1/2/3 and the subjective slice of R-VIEW-1.

### Phases v2-2 … v2-8 — the remaining domains ☐ (documented, not built)
One phase per domain; each adds its own typed entity (Drizzle + Zod + enums), capture UI, and day/overview surface, following the v2-1 pattern. Order TBD with the owner.

- **v2-2 — Inputs** ☑ (pending merge of v2-2d) — food, drinks, supplements, medication, caffeine, hydration. Re-homes the MVP's food ([ADR-013](ARCHITECTURE.md#adr-013)) and composite-supplement/ingredient model ([ADR-010](ARCHITECTURE.md#adr-010)) into typed entities. **v2-2a (data + resolution, merged):** `substance` (seeded) + `input_item`/`item_component` (product/recipe/simple) + `intake_event` + `resolved_amount`; a pure resolution engine (item × qty → substances, recursing recipes, scaling, unit normalization) + repository (create items, log/edit/soft-delete events with frozen snapshots, daily totals). ADR-018, R-DOM-4. **v2-2b (API, merged):** Hono routes — `GET /api/substances`, items (`POST`/`GET`/`GET /:id`), intake (`POST`/`GET`/`PATCH`/`DELETE`), `GET /api/intake/totals`; token-guarded + Zod-validated, integration-tested. **v2-2c (PWA, in review):** a `/inputs` SvelteKit screen — capture (item search/autocomplete or freeform, amount/unit, time, tags → `POST /api/intake`) + an Inputs overview (today's per-substance **totals** and a **timeline** with the resolved breakdown). Adds the **responsive nav** (top nav on desktop, bottom tab bar on phones: Feel | Inputs) and lifts the token gate into the layout. Vitest API-client tests; `svelte-check` + build clean; browser-verified end to end. **v2-2d (Manage UI, in review):** a `/manage` screen to create items (product/recipe/simple) with components — substances (canonical unit auto-filled) or child-item ingredients — plus a list of your items, and the **Manage** nav tab. Browser-verified: an item created in the UI logs + resolves on Inputs. With this, **Inputs (v2-2) is feature-complete** for the first cut (item edit/delete UI can follow later). **v2-2e (Add Item by label photo, in review):** the `/manage` screen becomes **Add Item** — the manual form is replaced by phone-camera/upload capture → `POST /api/items/scan` (Claude vision behind an `ItemScanner`; SDK isolated in `scan_anthropic.ts`, pure parser in `scan.ts`) → an **editable draft** the user corrects → **Save** (`POST /api/items`). Unknown actives **auto-create** a `substance` (normalized name, coerced canonical unit, `type: other`) so the whole label is captured. Scanning is optional (`503` with no `ANTHROPIC_API_KEY` → manual fallback). R-CAP-17, [ADR-019](ARCHITECTURE.md#adr-019). Server + web tests; scan→edit→save + auto-create browser-verified (live vision device-verified). **v2-2f (Log capture overhaul, in review):** the Log screen drops the freeform manual form for three capture modes — **photo** of a meal, **voice** (transcribed **on-device** via the browser's Web Speech API), and **recent items** (`GET /api/intake/recent-items`). Photo/phrase → `POST /api/intake/recognize` (Claude behind an `IntakeRecognizer` seam) → recognized name/qty/unit + estimated nutrients **matched** against the catalog → a **quick-confirm** to log against a match, **save as a new item** + log, or log by name. Anthropic is the only API key (voice needs no server key); recognition `503`s gracefully when unset. R-CAP-16/18/19, [ADR-020](ARCHITECTURE.md#adr-020). Server + web tests; recent→confirm→log + 503 fallback browser-verified (live photo/voice device-verified).
- **v2-3 — Behaviors & Interventions** — sleep habits, workouts, meditation, breathwork, work blocks, social actions.
- **v2-4 — Exposures (Environment & Context)** — light, weather, noise, temperature, social environment, work pressure.
- **v2-5 — Body Signals / Biometrics** — sleep metrics, HRV, soreness, digestion, pain, illness, hunger. (Natural home for the deferred Whoop adapter, ex-Phase 8.)
- **v2-6 — Performance Outputs** — deep work, learning, gym performance, social actions, habit adherence.
- **v2-7 — Events / Stressors / Wins** — arguments, rejections, deadlines, good conversations, achievements.
- **v2-8 — Context** — time, place, day type, season, current goal, experiment phase.
- **Expand Subjective State** (small) — add the remaining dimensions (stress, confidence, motivation, calmness, playfulness) as columns when the owner wants them.

### Capture Seamlessness track (v2-C) — make logging 1–3 seconds

Goal: "log now in one tap, add precision later." Built on a **new `/capture` screen** beside the existing
Log screen (Log is retired once Quick Capture covers its uses). Each phase ships, is tested, and is
owner-approved before the next. R-CAP-22…27, [ADR-027](ARCHITECTURE.md#adr-027).

- **v2-C0 — Foundations** ◐ (built, pending approval) — **capture provenance** (`intake_event.source` enum
  set by every path: quick/recent/photo/voice/manual/api — fixes R-CAP-12) + **"you log this a lot, pin it?"**
  suggestions on Quick Capture (`GET /api/intake/favorite-suggestions`). R-CAP-12, R-CAP-28,
  [ADR-028](ARCHITECTURE.md#adr-028). *(Precision rough/precise + ranges deferred to v2-C4.)*
- **v2-C1 — Quick Capture + one-tap favorites** ◐ (built, pending approval) — `/capture` screen with a grid
  of pinned favorites; tap = instant log + **Undo**; optional **amount presets** (Water 250/500/750).
  `quick_log`/`quick_order` on items + a `quick_preset` table; `GET /api/intake/quick-items`,
  `PATCH /api/items/:id/quick-log`; curated from the Add Item item popup. R-CAP-22.
- **v2-C2 — Stacks & checklists** ◐ (built, pending approval) — a stack is a recipe of items (built via a
  *Stack members* editor section + *Create manually* entry); one tap logs the whole stack, an expandable
  checklist skips items today (partial → per-member events). `quick-items` returns members; `stackLogPlan`
  decides whole-vs-partial. Medication exact-dose = pin with dose presets. R-CAP-23, [ADR-029](ARCHITECTURE.md#adr-029).
- **v2-C3 — Meal templates + quick modifiers** ☐ — size scaler + add/remove an ingredient for this log.
  R-CAP-24.
- **v2-C4 — Photo portion sizing + honest ranges** ☐ — Light/Medium/Large; confidence-aware ranges;
  rough/precise flag. R-CAP-25.
- **v2-C5 — Smart suggestions** ☐ — quiet time/pattern prompts. R-CAP-26.
- **v2-C6 — Daily reconstruction & forgot-to-log** ☐ — end-of-day gaps, fuzzy-time "add earlier", one
  utterance → a day. R-CAP-27.

### Phase v2-A — Cross-domain analysis ◐ (started)
Re-frames MVP Stage C (real-time questions) and Phase 10 (correlation) over the typed entities: assemble a cross-domain timeline by unioning the entities, compute correlations (inputs/behaviors/exposures → subjective/performance outcomes), and have the LLM interpret. Carries forward R-RT-* and R-PAT-*. **First cut shipped — the "Ask LLM" screen (R-RT-7, [ADR-023](ARCHITECTURE.md#adr-023)):** `POST /api/ask` gathers the last 48h of check-ins + intake server-side and Claude answers preset/free-text questions on the `/ask` screen. Still to come: statistical correlation/lagged analysis and a user-selectable window.

### Phase v2-X — Cutover to v2 ☑
**Done (2026-06-15).** v2 is live at the production URL (entrypoint `server/main.ts`,
`/api/health` → 200); tagged `v1-mvp` (pre-cutover) and `v2` (cutover). Remaining: the owner
drops the now-unused MVP tables manually (`drop table if exists events, ingredients, templates,
items cascade;`) — optional cleanup, not required for v2.

**In the repo (done):** the v2 service is production-hardened to match the MVP — an
`unhandledrejection` guard + a startup DB warm in `server/main.ts`, and an open `/health`
(and `/api/health`) where `?warm=1` runs `select 1` so the existing hourly warmup workflow
keeps the Supabase project awake. CI builds + tests `web/` and the Deno service.

**You do (Deno Deploy dashboard + prod DB — needs the dashboard/secret I don't have):**

1. **Migrate prod:** `DATABASE_URL='<prod pooler URI>' deno task migrate` — additive; creates
   `subjective_state`, does **not** touch the MVP tables.
2. **Repoint the deploy:** in the Deno Deploy project, set the **build command** to
   `npm --prefix web ci && npm --prefix web run build` and change the **entrypoint** from
   `backend/main.ts` → `server/main.ts`. Env vars are unchanged (`DATABASE_URL`, `INGEST_TOKEN`).
   _(If the project can't run a build step, ask me to commit a prebuilt `web/build` instead.)_
3. **Redeploy**, open the URL, enter the `INGEST_TOKEN` once — the new UI is live.
4. **Optional clean slate:** once happy, drop the MVP tables (`events`, `templates`, `items`,
   `ingredients`) — owner okayed losing that data. v2 doesn't need them.
5. Tag `v1-mvp` and `v2`. _(Done — and the `backend/` code has since been deleted; it lives on in the `v1-mvp` tag.)_

---

## v1 (MVP) — superseded by v2 (kept for history)

> The v1 code has been **deleted** from the working tree; it's preserved in the **`v1-mvp`**
> git tag. The `backend/…` links below are historical references to that tagged code.

## Stage A — Foundation

### Phase 0 — Project & test harness ☑
- **Goal:** A skeleton that proves the toolchain, with CI running tests, before any features.
- **Build:** Supabase project (dev), repo + test runner, CI pipeline, secrets for Claude API, one trivial endpoint.
- **Tests:** 1 unit smoke test; 1 integration test that reaches the test DB and makes a "hello" Claude call (mocked in CI, live in the on-demand suite).
- **You verify:** CI badge is green; you can run the test suite locally with one command.
- **Builds:** R-NFR-1, R-TEST-4, R-TEST-5
- **Implementation notes (in progress):**
  - Stack chosen: **Deno + TypeScript** (Supabase Edge Functions runtime; built-in
    test runner → "one command" is `deno task test`). Code in [`backend/`](../backend/).
  - `ClaudeClient` seam ([`backend/src/claude.ts`](../backend/src/claude.ts)) makes the
    LLM mockable; deterministic tests use `MockClaudeClient`, the live suite uses the
    real Anthropic SDK (`claude-opus-4-8`).
  - DB connectivity test auto-skips with no `DATABASE_URL` (passes locally); runs in CI
    against a Postgres service container.
  - CI: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — fmt + lint + type-check
    + deterministic tests. Live suite excluded from CI.
  - **Status: APPROVED (2026-06-12)** — CI green on `main` (commit `5327eeb`); `deno task test`
    green locally (7 passed, DB test skipped).
  - **Still manual (your accounts):** create the Supabase dev project (Phase 1); add
    `ANTHROPIC_API_KEY` to run `test:live`. See [`backend/README.md`](../backend/README.md).

### Phase 1 — Event-log schema ☑
- **Goal:** The system of record exists.
- **Build:** Migration for the `events` table (dual timestamps, `source`, JSON `fields`, confidence flag) + `templates` and `items` tables; the data dictionary (units/field names).
- **Tests:** Unit (row validation helpers); integration (insert → read an event, assert `occurred_at`/`recorded_at`, source, JSON fields survive a roundtrip).
- **You verify:** You insert a sample event via a provided script and see it stored correctly.
- **Builds:** R-CAP-1, R-CAP-7, R-CAP-12, [ADR-006](ARCHITECTURE.md#adr-006)
- **Implementation notes (in progress):**
  - Schema: [`backend/migrations/0001_event_log.sql`](../backend/migrations/0001_event_log.sql)
    — `events` (dual timestamps, `occurred_at_confidence` check, `source`, `jsonb fields`,
    nullable `template_id`) + `items` + `templates`. `items` is the home the Phase 4b
    products/ingredients extension will build on.
  - Data dictionary: [`backend/docs/data-dictionary.md`](../backend/docs/data-dictionary.md);
    code-side vocab in [`backend/src/vocab.ts`](../backend/src/vocab.ts) (categories/sources
    validated in the app layer, not by DB constraints, per ADR-006).
  - Repository + validation: [`backend/src/events.ts`](../backend/src/events.ts); tiny
    migration runner [`backend/src/migrate.ts`](../backend/src/migrate.ts).
  - Acceptance helper: `deno task seed` inserts a sample event and prints the stored row.
  - **Local status:** full suite green against a real Postgres — **18 passed** (incl. the
    insert→read roundtrip asserting dual timestamps + nested JSON survive). CI runs the same
    against its Postgres service.
  - **Status: APPROVED (2026-06-12)** — PR #2 merged; CI green. `R-CAP-1`/`R-CAP-7`/`R-CAP-12` → Built.

---

## Stage B — Capture

### Phase 2 — Manual capture (no LLM) ☑
- **Goal:** Log a structured event end to end without any AI in the path.
- **Build:** `POST /events` Edge Function (validate + store); a Shortcut with a fill-in form that calls it.
- **Tests:** Unit (validation, rejects bad payloads); integration (HTTP → DB roundtrip).
- **You verify:** Tap the Shortcut, fill fields, see the row appear.
- **Builds:** R-CAP-3
- **Implementation notes (in progress):**
  - Endpoint: [`backend/functions/events/index.ts`](../backend/functions/events/index.ts)
    — `POST /events`, reuses the Phase 1 validation/repository, returns the stored row.
    Protected by a shared secret (`INGEST_TOKEN`, as `Authorization: Bearer` or
    `x-ingest-token`) — a public write endpoint must be guarded. `source` defaults to
    `manual`.
  - Client setup + curl + Supabase deploy notes: [`backend/docs/manual-capture.md`](../backend/docs/manual-capture.md).
    Run locally with `deno task serve:events`.
  - Tests: unit (405 / 401 / bad-JSON / invalid-event, DB untouched) + integration
    (HTTP → DB roundtrip; `source` defaulting).
  - **Local status:** full suite green against a real Postgres — **24 passed**; also
    smoke-tested the running server with curl (401 without token, 201 + stored row with it).
  - **Note:** R-CAP-11 (offline capture) moved off this phase — Shortcuts need network;
    a true offline queue is a native-app concern (Phase 11).
  - **Status: APPROVED (2026-06-12)** — PR #3 merged; CI green. `R-CAP-3` → Built.

### Phase 3 — Voice → structured extraction ☑
- **Goal:** Speak freely; get clean structured records.
- **Build:** `POST /capture` (transcript → Claude structured output → candidate events, not yet saved) + confirm step that persists; known-items + taxonomy context.
- **Tests:** Unit (parse/validate Claude output; relative-time resolution with fixed "now"). Fixture/golden (sample transcripts → expected event count/categories; inferred-time flagging). Integration (transcript → candidates → confirm → stored).
- **You verify:** Speak "coffee and my magnesium at 10am," see 2 candidates with the right times, confirm, rows stored.
- **Builds:** R-CAP-2, R-CAP-8, R-CAP-9, R-CAP-10, R-TEST-3, [ADR-005](ARCHITECTURE.md#adr-005)
- **Implementation notes (in progress):**
  - Claude seam gained `extractJson` ([`backend/src/claude.ts`](../backend/src/claude.ts)); extraction logic in [`backend/src/extract.ts`](../backend/src/extract.ts) — prompt (taxonomy + known items), JSON→candidate mapping, and **deterministic time resolution** against a fixed "now" (now/absolute/relative_minutes/unknown → `occurredAt` + confidence).
  - `POST /capture` ([`backend/functions/capture/index.ts`](../backend/functions/capture/index.ts)) returns candidates, **does not save** (R-CAP-9). Persistence reuses `POST /events`, now extended with a **batch** form (`{events:[...]}`, atomic) for the confirm step.
  - Flow + curl + Shortcut (Dictate Text): [`backend/docs/voice-capture.md`](../backend/docs/voice-capture.md).
  - **Local status:** deterministic suite green against real Postgres — **37 passed** (incl. time-resolution unit tests, a golden fixture turning "coffee and my magnesium" into 2 candidates, and the batch confirm→DB roundtrip).
  - ⚠️ **Unverified by me:** the live extraction against the real model (needs your `ANTHROPIC_API_KEY`). Run `deno task test:live` to confirm the prompt yields the expected JSON before approving.
  - **Status: APPROVED (2026-06-12)** — PR #4 merged; CI green. `R-CAP-2`/`R-CAP-8`/`R-CAP-9`/`R-CAP-10`/`R-TEST-3` → Built.

### Phase 4 — Quick-log templates ☑
- **Goal:** One tap to log a repeated habit.
- **Build:** Template CRUD + expansion (template + defaults → event); Shortcuts for "my coffee", "protein shake".
- **Tests:** Unit (expansion, default fields, time-aware defaults); integration (one call → correct stored event).
- **You verify:** One tap logs your coffee with the right defaults.
- **Builds:** R-CAP-5, R-CAP-6
- **Implementation notes (in progress):**
  - Repository [`backend/src/templates.ts`](../backend/src/templates.ts): validation, CRUD, and a pure `expandTemplate` (template + defaults → event; per-tap `fields` override; `occurredAt` defaults to tap time; `source` `quicklog`; `template_id` set).
  - `GET/POST /templates` ([`backend/functions/templates/index.ts`](../backend/functions/templates/index.ts)) to manage templates; `POST /quicklog` ([`backend/functions/quicklog/index.ts`](../backend/functions/quicklog/index.ts)) for the one-tap log. Both token-guarded. `deno task templates:seed` adds examples.
  - Flow + curl + one-tap Shortcut: [`backend/docs/quick-log.md`](../backend/docs/quick-log.md).
  - **Scope note:** "time-aware defaults" is realized as `occurredAt = tap time` (overridable). The smarter *time-aware suggestion* (offer the morning stack at 7am) is deferred — it's a client/UX refinement, not needed for one-tap.
  - **Local status:** deterministic suite green against real Postgres — **51 passed**; also smoke-tested the running server: seed → tap "my coffee" → `201` (expanded event stored, `source` quicklog), unknown template → `404`.
  - **Status: APPROVED (2026-06-12)** — PR #5 merged; CI green. `R-CAP-5`/`R-CAP-6` → Built.

### Phase 4b — Composite supplements & label-photo ingredients ☑
- **Goal:** Log multi-ingredient supplements by product name; define their ingredients once, including from a label photo.
- **Build:** `products` + `ingredients` schema (per-ingredient name/amount/unit + canonical ingredient); product-aware quick-log (logs reference a product + optional `servings`); label-photo → Claude vision → structured ingredient list → confirm → save on the product.
- **Tests:** Unit (ingredient parsing, servings multiplier, product→ingredient expansion math); fixture (label image → expected ingredient list); integration (define a product, log it, expand it to ingredient amounts).
- **You verify:** Photograph a supplement label → confirm the extracted ingredients → log the product by name → see it both as the product and expanded into its ingredients.
- **Builds:** R-CAP-13, R-CAP-14, R-CAP-15, R-PAT-5, [ADR-010](ARCHITECTURE.md#adr-010)
- **Implementation notes (in progress):**
  - Schema [`0002_products_ingredients.sql`](../backend/migrations/0002_products_ingredients.sql): `ingredients` table (FK to `items`, `amount` double precision, `canonical_name`, `position`) + `events.item_id` linking a log to its product.
  - [`backend/src/products.ts`](../backend/src/products.ts): validation, CRUD, pure `expandToIngredients` (servings multiplier; null amounts stay null), `parseIngredientCandidates`, and `extractIngredientsFromImage` (Claude **vision** via the seam's new `extractJsonFromImage`).
  - Endpoints: `POST /ingredient-scan` (label photo → candidates, unsaved — R-CAP-15), `GET/POST /products` (manage; `GET ?name&servings` returns expanded amounts), and `POST /quicklog {product, servings}` to log by name (R-CAP-13). Flow: [`backend/docs/composite-supplements.md`](../backend/docs/composite-supplements.md).
  - **Local status:** deterministic suite green against real Postgres — **69 passed** (incl. expansion math, vision-fixture parsing, create→get+expand, and product-by-name logging with `item_id`). Smoke-tested the products server: create + `GET ?servings=2` → amounts doubled.
  - ⚠️ **Unverified by me:** the live **vision** extraction from a real label photo (needs your `ANTHROPIC_API_KEY` + a label image). Run `deno task test:live` with `TEST_LABEL_IMAGE` set before approving.
  - **Status: APPROVED (2026-06-12)** — PR #6 merged; CI green. `R-CAP-13`/`R-CAP-14`/`R-CAP-15`/`R-PAT-5` → Built.

### Phase 5 — Subjective check-ins ☑
- **Goal:** Capture mood/energy/focus, nudged and on-demand.
- **Build:** mood/energy/focus as events with `rating`; on-demand Shortcut; scheduled prompt (iOS automation/notification).
- **Tests:** Unit (rating bounds/validation); integration (check-in stored as event).
- **You verify:** Log a mood on demand; receive a scheduled nudge and complete it.
- **Builds:** R-SUBJ-1, R-SUBJ-2, R-SUBJ-3
- **Implementation notes (in progress):**
  - [`backend/src/checkins.ts`](../backend/src/checkins.ts): `validateCheckin` (1–5 integers; ≥1 dimension) + pure `buildCheckinEvents` (one event per provided dimension; category mood/energy/focus, `fields.rating`).
  - `POST /checkin` ([`backend/functions/checkin/index.ts`](../backend/functions/checkin/index.ts)) stores them atomically. On-demand + scheduled use the same endpoint; scheduling is an **iOS Time-of-Day Automation** (no backend cron) — see [`backend/docs/check-ins.md`](../backend/docs/check-ins.md).
  - **Scope note:** R-SUBJ-2 (scheduled prompt) is realized client-side (iOS Automation triggers the check-in Shortcut). R-SUBJ-4 (rate right after an event) is a native-app UX refinement, deferred.
  - Resolves part of **Q2**: scale is **1–5, separate** mood/energy/focus.
  - **Local status:** deterministic suite green against real Postgres — **80 passed**; smoke-tested the running server (mood+energy+focus → 3 events; out-of-range rating → 400).
  - **Status: APPROVED (2026-06-12)** — PR #7 merged; CI green. `R-SUBJ-1`/`R-SUBJ-2`/`R-SUBJ-3` → Built.

---

## Stage C — Real-time analysis

### Phase 6 — Context assembler + first question ☑
- **Goal:** Ask one real-time question and get a grounded answer.
- **Build:** Context assembler (last 24–48h timeline + baselines); `POST /ask` with the "what's dragging me down?" template; answer cites events.
- **Tests:** Unit (window selection, timeline formatting, baseline merge); fixture (given a fixed timeline, answer references the expected events).
- **You verify:** Ask the question against real data; the answer is sensible and cites specifics.
- **Builds:** R-RT-3, R-RT-6
- **Implementation notes (in progress):**
  - [`backend/src/context.ts`](../backend/src/context.ts): `selectWindow` + `assembleContext` — formats the last 24–48h as `[E#] <time> <category> <fields>` with a citation index; optional baselines.
  - [`backend/src/ask.ts`](../backend/src/ask.ts): question-template registry (one for now), prompt, `parseAnswer`, and `resolveCitations` ([E#] → event id, with `unmatchedCitations`). `answerQuestion` orchestrates assemble → Claude → resolve.
  - `POST /ask` ([`backend/functions/ask/index.ts`](../backend/functions/ask/index.ts)) fetches recent events (`getRecentEvents`, window default 48h / cap 72h) and returns `{answer, citedEvents, windowHours}`. Doc: [`backend/docs/real-time-analysis.md`](../backend/docs/real-time-analysis.md).
  - **Local status:** deterministic suite green against real Postgres — **92 passed** (incl. window selection, a fixture asserting the model's citations resolve to the expected events, and a DB-backed `/ask` integration test with Claude mocked).
  - ⚠️ **Unverified by me:** the live reasoning (needs your `ANTHROPIC_API_KEY`) — does the real model produce a grounded, correctly-citing answer. Run `deno task test:live`.
  - **Best validated with real data:** the answer quality only really shows over your own logged timeline (see the deploy suggestion).
  - **Status: APPROVED (2026-06-13)** — PR #8 merged; CI green. `R-RT-3`/`R-RT-6` → Built.

### Phase 7 — Remaining real-time questions ☑
- **Goal:** All five real-time questions over the same assembler.
- **Build:** Prompt templates for "why am I X", "what can I do now", "should I do X", "how will I feel later".
- **Tests:** Per-template fixture tests; integration for each route.
- **You verify:** Each question returns a useful, grounded answer.
- **Builds:** R-RT-1, R-RT-2, R-RT-4, R-RT-5
- **Implementation notes (in progress):**
  - Added four templates to the registry in [`backend/src/ask.ts`](../backend/src/ask.ts): `why_do_i_feel` (R-RT-1), `what_can_i_do_now` (R-RT-2), `should_i` (R-RT-4), `how_will_i_feel_later` (R-RT-5). Two take a free-text `param` (the feeling / the action); the handler returns `400` if a required `param` is missing. Same assembler + citation path as Phase 6 — no new endpoint.
  - Doc updated with the full question table: [`backend/docs/real-time-analysis.md`](../backend/docs/real-time-analysis.md).
  - **Local status:** deterministic suite green against real Postgres — **97 passed** (registry, parameterized prompt building, missing-param 400, and a parameterized `/ask` integration test).
  - ⚠️ **Unverified by me:** live answer quality for the new questions (needs your `ANTHROPIC_API_KEY`).
  - **Status: APPROVED (2026-06-13)** — PR #9 merged; CI green. `R-RT-1`/`R-RT-2`/`R-RT-4`/`R-RT-5` → Built. Completes Stage C.

---

## Stage D — Integrations

> **Ordering note (2026-06-13).** Phase 11 (web UI) was built first so the app can be
> used daily. **Phase 8 (Whoop) is deferred**; **Phase 9 (daily overview) is being built
> next** to give that UI something to show over real data. Phase 10 follows. Plans are
> unchanged; only the ordering moved.

### Phase 8 — Whoop adapter ☐ (deferred)
- **Goal:** Whoop sleep/recovery/strain flows into the event log.
- **Build:** Source-adapter interface; Whoop OAuth + pull job mapping payloads → events. (Resolves Q1: Whoop API vs HealthKit.)
- **Tests:** Unit (Whoop payload → events mapping, from recorded fixtures); integration (sync job writes correct events); live suite hits real Whoop.
- **You verify:** A real Whoop night appears in your timeline with correct values.
- **Builds:** R-SRC-1, R-SRC-3, R-SRC-4

---

## Stage E — Overviews & insights

### Phase 9 — Daily overview ☑
- **Goal:** See today at a glance.
- **Build:** Daily aggregation (caffeine total, last-caffeine time, sleep hours, workout load, subjective averages) + a simple daily dashboard view. Aggregation **expands composite supplements into ingredient amounts** so per-ingredient totals are available (R-PAT-5).
- **Tests:** Unit (aggregation math on synthetic days, incl. product→ingredient expansion); integration (events → aggregates).
- **You verify:** Today's overview matches what you logged, including ingredient totals from any supplements.
- **Builds:** R-PAT-2, R-VIEW-1 (uses the R-PAT-5 ingredient expansion built in Phase 4b)
- **Implementation notes (in progress):**
  - Pure aggregator [`backend/src/aggregate.ts`](../backend/src/aggregate.ts) (`aggregateDay`): caffeine total + last time, sleep minutes, workout count/duration, mood/energy/focus averages, by-category counts, and a per-ingredient rollup (products expanded via `expandToIngredients`, summed by canonical name).
  - `GET /overview?date=YYYY-MM-DD` ([`backend/functions/overview/index.ts`](../backend/functions/overview/index.ts), UTC day, default today) → the summary. Repo: `getEventsBetween` + `getIngredientsForItems`. Doc: [`backend/docs/overview.md`](../backend/docs/overview.md).
  - PWA **Today** card renders it on open and after a check-in/quick-log.
  - **Local status:** deterministic suite green against real Postgres — **109 passed** (aggregation math incl. ingredient expansion + null amounts; handler guards; DB-backed `/overview` integration). Smoke-tested the running server (`/overview` returns the day's summary).
  - **Status: APPROVED (2026-06-13)** — PR #12 merged; CI green. `R-PAT-2`/`R-VIEW-1` → Built.

### Phase 10 — Weekly/monthly + correlation engine ☐ (deferred)
- **Goal:** Find patterns and explain them.
- **Build:** Weekly/monthly views; correlation + lagged (next-day) analysis; LLM interprets correlations into insights + suggested experiments.
- **Tests:** Unit (correlation/lag math on synthetic data with a known planted relationship); fixture (LLM turns a given correlation set into a coherent insight); integration.
- **You verify:** Weekly/monthly views are correct; an insight report surfaces a real (or planted-test) pattern.
- **Builds:** R-PAT-1, R-PAT-3, R-PAT-4, R-VIEW-2, R-VIEW-3

---

## Stage F — iPhone UI

### Phase 11 — Web UI (PWA) ◐
- **Goal:** A real tappable iPhone app for daily capture + asking — without a native build.
- **Decision:** A server-served **PWA** ("Add to Home Screen"), not native SwiftUI — see [ADR-012](ARCHITECTURE.md#adr-012) (supersedes the native-client plan in ADR-001). Native SwiftUI remains a possible future for offline/widgets/Watch.
- **Build:** A self-contained mobile web page served by the backend at `/` and `/app`, calling the same-origin API with the `INGEST_TOKEN` (kept in `localStorage`).
- **Tests:** Router serves the UI (200, `text/html`); embedded-script parse check; the endpoints the UI calls are already covered.
- **You verify:** Open the deploy URL on your iPhone → Add to Home Screen → check in, quick-log, voice-capture+confirm, and Ask all work.
- **Builds:** R-CAP-6, R-NFR-6, [ADR-012](ARCHITECTURE.md#adr-012). (R-CAP-11 offline-queue is **not** delivered by the PWA — still future/native.)
- **Implementation notes (in progress) — daily slice:**
  - UI in [`backend/ui/app.ts`](../backend/ui/app.ts) (inline HTML/CSS/JS, no build step); served via [`backend/main.ts`](../backend/main.ts).
  - Screens: **Check-in** (mood/energy/focus tap-scale → `/checkin`), **Quick log** (buttons built from `/templates` + `/products` → `/quicklog`), **Capture** (text/keyboard-mic → `/capture` → review candidates → `/events`; realises the R-CAP-9 confirmation card as actual UI), **Ask** (the five `/ask` questions, incl. the two parameterized ones, with the cited-event count).
  - **Local status:** lint/check green; embedded script parses; **87 unit tests** (incl. router serves `/app`). Smoke-tested the running server: `/app` 200 text/html, and `/templates`/`/quicklog`/`/checkin` taps all 201.
  - ⚠️ **In-browser behaviour is device-verified** (like the Shortcuts) — I serve and parse it, but you confirm the live feel on your phone.
  - **Next slices (not in this PR):** a timeline/history view (needs `GET /events`), inline editing of capture candidates, product label-scan screen, settings polish.
  - **Status: APPROVED (2026-06-13)** — PR #11 merged; CI + Deno Deploy build green. `R-NFR-6` → Built. (Phase stays open for further slices: timeline view, candidate editing, label-scan screen.)

---

## Stage F (cont.) — UI completion slices

> **Why (2026-06-13).** Phase 11 shipped the daily-capture loop (check-in, quick-log,
> capture→confirm, ask, today). These slices close the gap between what the backend exposes
> and what the UI uses: editable confirmation, manual/detailed logging, product/template
> management incl. label-scan, and a history view. Each is a small, independently-shippable
> slice with its own approval gate. Slices 11a–11c are **UI-only** over existing endpoints;
> 11d adds one backend list endpoint.

### Phase 11a — Editable confirmation card + backdating ☑
- **Goal:** Capture's review step becomes truly correctable, and any log can be backdated.
- **Build:** In the Capture candidate list, make each candidate **editable before save** —
  category, the key field value(s), and `occurredAt` (date/time) — not just include/exclude.
  Send the edited candidates to `POST /events`. Fully realizes R-CAP-9's "one-tap edit" and
  surfaces the existing `occurredAt` backdating (R-CAP-7) in the UI.
- **Tests:** Router still serves `/app` (200, text/html); embedded-script parse check;
  endpoints unchanged (already covered). Manual device verification of the edit/backdate feel.
- **You verify:** Extract "coffee at 10am", change the amount and time on a candidate, save,
  and the stored event reflects your edits and `occurred_at`.
- **Builds:** completes R-CAP-9 (UI), R-CAP-7 (UI surface).
- **Status: APPROVED (2026-06-13)** — PR #13 merged. Added a real embedded-script parse test
  (the inline JS was previously invisible to `deno check`). Also shipped a separate `/capture`
  timezone fix (PR #14) and a Postman collection + drift test (PR #15).

### Phase 11b — Manual & detailed logging ◐
- **Goal:** Log a structured event by hand, and reach the per-log options the UI hides.
- **Build:** A **Log manually** form (category + a couple of fields + optional `occurredAt`) →
  single `POST /events`; a **note** field on Check-in (`POST /checkin {note}`); a
  **servings / fields override** on a quick-log tap (`POST /quicklog {servings, fields}`).
- **Tests:** UI serve/parse checks; endpoints already covered (servings/note/occurredAt are
  existing inputs). Manual device verification.
- **You verify:** Hand-log a backdated event; add a note to a check-in; log a 2-serving dose.
- **Builds:** R-CAP-3 (UI manual entry), R-SUBJ-1 (note), R-CAP-14 (servings in UI).
- **Implementation notes (in progress):**
  - All UI-only, over existing endpoints, in [`backend/ui/app.ts`](../backend/ui/app.ts):
    - **Log manually** card — category `<select>`, dynamic field key/value rows (numeric values
      coerced to numbers), optional `datetime-local` (blank = now, earlier = backdate) → a single
      `POST /events` with `source: manual`, `occurredAtConfidence: high`.
    - **Check-in** gains an optional `note` field → `POST /checkin {note}`.
    - **Quick log** gains an **Options…** panel — `servings` (scales a product's dose) and a
      `fields` override (`key=value, …`, numbers coerced), merged into each `POST /quicklog`.
  - **Tests:** embedded-script parse check + an 11b feature-lock test. Suite green — **108 passed**.
  - ⚠️ **Device-verified** like prior UI slices: served + parsed here; you confirm on the phone.

### Phase 11c — Manage: products, templates, label scan ◐
- **Goal:** Define supplements (incl. from a label photo) and quick-log templates from the app.
- **Build:** A **Manage** screen: (1) **label-scan** — pick/take a photo, `POST /ingredient-scan`
  (vision) → confirm/edit the extracted ingredient list → `POST /products` (realizes the
  R-CAP-15 image path in the UI); (2) **create product** by hand; (3) **create template**
  (`POST /templates`); (4) an **expansion preview** (`GET /products?name&servings`). New products/
  templates immediately appear as Quick-log buttons.
- **Tests:** UI serve/parse checks; endpoints already covered. ⚠️ live vision verified on device
  (needs `ANTHROPIC_API_KEY` + a real label).
- **You verify:** Photograph a label → confirm ingredients → save product → see it in Quick log;
  create a template and tap it.
- **Builds:** R-CAP-13/14/15 (UI), R-CAP-5 (UI template creation), R-PAT-5 (expansion preview).
- **Implementation notes (in progress):**
  - A **Manage** card in [`backend/ui/app.ts`](../backend/ui/app.ts), all over existing endpoints:
    - **New product** — name + category `<select>` + editable ingredient rows (name/amount/unit)
      → `POST /products`. A **Scan label** file picker reads the photo as base64 and `POST`s it to
      `/ingredient-scan`; the returned ingredients fill the rows for confirm/edit before saving
      (the R-CAP-15 image path, now in the UI).
    - **New template** — name + category + `key=value` fields → `POST /templates`.
    - **Ingredient breakdown** — name + servings → `GET /products?name&servings`, listing the
      expanded per-ingredient amounts. Saving a product/template refreshes the Quick-log buttons.
  - **Tests:** embedded-script parse check + an 11c feature-lock test (scan→product, create
    product/template, breakdown). Suite green — **109 passed**.
  - ⚠️ **Device-verified** (esp. the live label scan: needs `ANTHROPIC_API_KEY` + a real photo;
    iOS may hand over HEIC — if the scan 400s, the label was an unsupported type).

### Phase 11d — Timeline / history view ◐
- **Goal:** See and scroll the actual event log, and see which events an answer cited.
- **Build:** A backend **`GET /events`** list endpoint (date-range + limit, token-guarded,
  reusing `getEventsBetween`/`getRecentEvents`); a **Timeline** card that lists recent events;
  render the **cited events** (not just a count) under an Ask answer; a **`windowHours`** control
  on Ask. (R-VIEW-4.)
- **Tests:** Unit (query-param parsing/clamping); integration (HTTP → DB list roundtrip, range +
  limit); UI serve/parse checks.
- **You verify:** Open Timeline, see today's events in order; ask a question and see the specific
  cited events; widen the Ask window.
- **Builds:** R-VIEW-4 (new), R-RT-6 (cited-event detail in UI).
- **Implementation notes (in progress):**
  - **Backend:** `listEvents` ([`src/events.ts`](../backend/src/events.ts)) — newest-first, capped
    `limit`, optional `[from, to)`. `GET /events?limit&from&to`
    ([`functions/events/index.ts`](../backend/functions/events/index.ts), limit clamped 1–200/def 50,
    bad date → 400). `CitedEvent` ([`src/ask.ts`](../backend/src/ask.ts)) enriched with `occurredAt`
    + `fields` so answers can show the cited events.
  - **UI** ([`backend/ui/app.ts`](../backend/ui/app.ts)): a **Timeline** card (`GET /events?limit=50`),
    cited-event detail under Ask, and a 24/48/72h **Window** control sending `windowHours`. Also a
    **cookie**-backed token (survives reloads where a standalone PWA clears `localStorage`).
  - **Tests:** unit (limit/date 400 path, router PUT→405), integration (newest-first list with
    limit + window — verified against a real Postgres), UI parse + 11d feature-lock. **126 passed**
    with DB (111 without).
  - **On approval:** flip `R-VIEW-4` → Built.
  - **Bundled fix:** token persistence moved to a cookie (the user reported it was lost on reload).

---

## Stage G — Nutrition & food

### Phase 12 — Photo food logging ◐
- **Goal:** Log meals from a photo with calorie + macro estimates (R-CAP-16).
- **Build:** `POST /food-scan` (Claude vision → itemized foods with `amount`/`unit`, `calories`,
  `protein_g`/`carbs_g`/`fat_g`, context `ingredients`); a Home **Photo food** card (review/edit each
  item — adjust amount to rescale, or type calories; pick a meal) → `POST /events` as `food` events
  (`source: photo`); a daily **calorie + macro total** on the overview. Nutrition is **LLM-estimated**
  ([ADR-013](ARCHITECTURE.md#adr-013)).
- **Tests:** unit (food parsing/sanitising; food-scan handler; aggregate calories/macros; router 503);
  integration (overview calorie total); UI feature-lock (scan → itemized edit → rescale → overview).
- **You verify:** Photograph steak + eggs → two editable items with sensible guesses; bump the steak
  to 250 g and watch calories scale; override the eggs' calories; pick a meal; save → two food events;
  Today shows the calorie + macro totals.
- **Builds:** R-CAP-16, R-PAT-2 (calories), [ADR-013](ARCHITECTURE.md#adr-013). New `photo` source.
- **Implementation notes (in progress):**
  - [`src/food.ts`](../backend/src/food.ts) (prompt + `parseFoodCandidates` + `extractFoodFromImage`),
    [`functions/food_scan/index.ts`](../backend/functions/food_scan/index.ts),
    [`ui/app.ts`](../backend/ui/app.ts) (Photo food card; amount rescales calories+macros; calorie
    total on the overview). Aggregate sums `calories` + macros.
  - **Local status:** deterministic suite green — **124 passed** / **141 with a DB**. Browser-verified
    the review/edit/rescale/save + overview totals with a mocked scan response (the live vision call is
    device-verified, needs `ANTHROPIC_API_KEY`).
  - **On approval:** flip `R-CAP-16` → Built.

### Phase 13 — Nutrition database integration ☐ (deferred)
- **Goal:** Replace/back-stop the LLM calorie+macro estimates with a real nutrition database for
  accuracy (supersedes [ADR-013](ARCHITECTURE.md#adr-013)).
- **Build:** Identify foods (vision) → look up calories/macros in a nutrition DB (USDA FoodData
  Central / Nutritionix); map portions; keep the same `food` event shape. (Resolves the accuracy
  trade-off noted in ADR-013.)
- **Tests:** Unit (food→DB mapping from fixtures); integration (lookup → event); live suite hits the
  real nutrition API.
- **You verify:** A scanned meal's calories match the database within a sensible tolerance.
- **Builds:** R-CAP-16 (accuracy), R-SRC-3 (pluggable sources).

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-11 | Initial phased, gated roadmap created. |
| 2026-06-11 | Phase 0 implemented (Deno backend, ClaudeClient seam, tests, CI) → ◐ in progress, awaiting owner verification. |
| 2026-06-12 | Phase 0 approved (CI green on main) → ☑. Added Phase 4b (composite supplements & label-photo ingredients); ingredient expansion noted in Phase 9. |
| 2026-06-12 | Phase 1 implemented (event-log schema, vocab, migration runner, repository, tests) → ◐ in review. |
| 2026-06-12 | Phase 1 approved (PR #2 merged) → ☑; R-CAP-1/7/12 → Built. |
| 2026-06-12 | Phase 2 implemented (`POST /events` with token auth, tests) → ◐ in review. Moved R-CAP-11 (offline) from Phase 2 to Phase 11. |
| 2026-06-12 | Phase 2 approved (PR #3 merged) → ☑; R-CAP-3 → Built. |
| 2026-06-12 | Phase 3 implemented (`POST /capture` extraction, time resolution, `/events` batch confirm, tests) → ◐ in review. |
| 2026-06-12 | Phase 3 approved (PR #4 merged) → ☑; R-CAP-2/8/9/10 + R-TEST-3 → Built. |
| 2026-06-12 | Phase 4 implemented (quick-log templates: `/templates` CRUD, `POST /quicklog`, expansion, tests) → ◐ in review. |
| 2026-06-12 | Phase 4 approved (PR #5 merged) → ☑; R-CAP-5/6 → Built. |
| 2026-06-12 | Phase 4b implemented (products + ingredients, label-scan vision, product quicklog, expansion, tests) → ◐ in review. |
| 2026-06-12 | Phase 4b approved (PR #6 merged) → ☑; R-CAP-13/14/15 + R-PAT-5 → Built. |
| 2026-06-12 | Phase 5 implemented (`POST /checkin` mood/energy/focus, validation, tests) → ◐ in review. |
| 2026-06-13 | Phase 5 approved (PR #7 merged) → ☑; R-SUBJ-1/2/3 → Built. |
| 2026-06-13 | Phase 6 implemented (`POST /ask` context assembler + "what's dragging me down?" with citations) → ◐ in review. |
| 2026-06-13 | Phase 6 approved (PR #8 merged) → ☑; R-RT-3/6 → Built. |
| 2026-06-13 | Phase 7 implemented (remaining four real-time questions, parameterized templates) → ◐ in review. |
| 2026-06-13 | Deploy enablement merged (PR #10): single `main.ts` router for Deno Deploy + Supabase (ADR-011). |
| 2026-06-13 | Phase 7 approved (PR #9 merged) → ☑; R-RT-1/2/4/5 → Built (Stage C complete). |
| 2026-06-13 | Phases 8–10 deferred; reworked Phase 11 from native SwiftUI to a **Web UI (PWA)** (ADR-012), implemented the daily slice → ◐ in review. |
| 2026-06-13 | Phase 11 approved (PR #11 merged) → ☑; R-NFR-6 → Built. |
| 2026-06-13 | Phase 9 (daily overview: `GET /overview` + aggregation + Today card) implemented → ◐ in review. (Phase 8 still deferred.) |
| 2026-06-13 | Phase 9 approved (PR #12 merged) → ☑; R-PAT-2/R-VIEW-1 → Built. |
| 2026-06-13 | Planned UI completion slices 11a–11d (editable confirmation, manual/detailed logging, manage/label-scan, timeline). Added R-VIEW-4. Building 11a. |
| 2026-06-13 | Phase 11a approved (PR #13 merged) → ☑. Shipped `/capture` timezone fix (PR #14) and a Postman collection + drift test (PR #15). |
| 2026-06-13 | Phase 11b implemented (manual single-event form, check-in note, quick-log servings/fields override) → ◐ in review. |
| 2026-06-13 | Phase 11c implemented (Manage card: label-scan→product, create product/template, ingredient-breakdown preview) → ◐ in review. |
| 2026-06-13 | Phase 11d implemented (`GET /events` list endpoint + Timeline card, cited-event detail + windowHours in Ask, cookie-backed token) → ◐ in review. |
| 2026-06-14 | Post-UI-test fixes (browser-driven): Timeline auto-refreshes after every log; `/overview` day window is the user's **local** day (`tzOffsetMinutes`); Timeline shows the note (`raw_text`); product quick-logs carry `item` = product name. |
| 2026-06-14 | Split the PWA into **four tabbed screens** (bottom nav): Home (check-in/capture/quick-log/manual), Overview (Today + Timeline + a **Weekly** placeholder for Phase 10 reports), Ask, Manage. UI-only, no API change. |
| 2026-06-14 | Overview enrichments: mood/energy/focus **line chart** (`/overview` now returns subjective `points`); composite supplements shown **by name** with a click-to-open **ingredients pop-up** (`/overview` returns a `products` list). |
| 2026-06-14 | Phase 12 (photo food logging: `POST /food-scan` vision → itemized calories+macros, Home card, overview totals) implemented → ◐ in review. Added Phase 13 (nutrition DB, deferred) and ADR-013. |
| 2026-06-15 | **v2 maturity rewrite** planned (ADR-015/016). Same repo, same infra (Deno Deploy + Supabase); new stack Hono + SvelteKit + Drizzle + Zod, single service. Data model re-framed as **8 typed per-domain entities** (R-DOM-1) replacing the unified event log; clean-slate DB at cutover. Added phases v2-1 (Foundation + Subjective State — mood/energy/focus, built first), v2-2…v2-8 (remaining domains, documented), v2-A (cross-domain analysis), v2-X (cutover). MVP stages A–G retained as history. |
| 2026-06-15 | v2-1a review feedback (ADR-017): remodelled `subjective_state` as immutable `(kind, rating)` readings — single discriminator column (extensible enum), `recorded_at` only, create+read API (no edit/delete). Tests updated (7 pass). |
| 2026-06-15 | Phase v2-1b implemented (in review): `web/` SvelteKit PWA — check-in card + Today day chart over the v2 `/api/checkins`, responsive (single column ↔ two-pane, R-VIEW-7), light/dark (R-VIEW-6); served as one Deno service. Vitest unit tests + svelte-check + production build; a third CI job covers `web/`. Browser-verified end to end. |
| 2026-06-15 | Phase v2-1 approved (PRs #35 + #36 merged) → ☑; R-DOM-1/R-DOM-2 → Built. Production-hardened the v2 service for cutover (`unhandledrejection` guard + startup DB warm in `server/main.ts`; open `/health` + `/api/health` with `?warm=1` → `select 1`). Phase v2-X (cutover to v2) → ◐ with the dashboard/migration checklist. |
| 2026-06-15 | Phase v2-X **cutover complete** → ☑. v2 is live (deploy entrypoint `backend/main.ts` → `server/main.ts`; build command builds `web/`); `/api/health` → 200. Tagged `v1-mvp` (last MVP commit) and `v2` (cutover). MVP table drop left to the owner (optional cleanup). |
| 2026-06-15 | Phase v2-2 (Inputs) started → ◐. Slice v2-2a (data + resolution): `substance` (seeded 22) + `input_item`/`item_component` + `intake_event` + `resolved_amount` (ADR-018, R-DOM-4); pure resolver (recipes/scaling/unit-normalization) + repository (items, log/edit/soft-delete with frozen snapshots, daily totals). 18 v2 tests pass; fmt/lint/check clean. API (v2-2b) + UI (v2-2c) next. |
| 2026-06-15 | Slice v2-2b (Inputs API, in review): Hono routes over the Inputs repo — substances list, items (create/list/detail), intake (log/list/edit/soft-delete), daily totals; token-guarded + Zod-validated; routes extracted to `server/inputs_routes.ts`. Integration roundtrip test added (19 v2 tests pass). |
| 2026-06-15 | Slice v2-2c (Inputs PWA, in review): `/inputs` SvelteKit screen — capture (item search/freeform → `POST /api/intake`) + Inputs overview (daily totals + timeline with resolved breakdown). Added the responsive nav (top nav / bottom tab bar: Feel | Inputs) and lifted the token gate into the layout. Vitest + svelte-check + build clean; browser-verified. v2-2d (Manage items UI) noted next. |
| 2026-06-15 | Slice v2-2d (Manage UI, in review): `/manage` SvelteKit screen to create items (product/recipe/simple) with components (substances — canonical unit auto-filled — or child-item ingredients) + an items list; added the Manage nav tab. Browser-verified: a UI-created item logs + resolves on Inputs. Inputs (v2-2) now feature-complete (item edit/delete UI later). 10 web tests pass. |
| 2026-06-15 | UI reorg (in review): consolidated the web app into **Log** (capture — "How do you feel?" + "Log an input"), **Overview** (mood/energy/focus chart + today's totals + today's inputs timeline), and **Manage** (unchanged). Extracted `CheckinForm`/`InputForm` components; removed the `/inputs` route. svelte-check + build clean; browser-verified. |
| 2026-06-15 | Removed the v1 (MVP) code: deleted the entire `backend/` directory (router, functions, src, migrations, ui, scripts, postman, MVP feature docs). v1 is preserved in the `v1-mvp` git tag. CI dropped the MVP `backend` job (kept `server` + `web`); CLAUDE.md's Postman binding rule removed (it governed the deleted collection). The living docs (REQUIREMENTS/ARCHITECTURE/ROADMAP) are unchanged except notes that v1 `backend/…` references are now historical (tag-only). |
| 2026-06-15 | Slice v2-2e (Add Item by label photo, in review): added R-CAP-17 + ADR-019. "Manage" → **Add Item**; replaced the manual item form with photo capture/upload → `POST /api/items/scan` (Claude vision via `ItemScanner`/`AnthropicItemScanner`; SDK isolated, tolerant pure parser `scan.ts`) → an **editable draft** → Save. Unknown actives **auto-create** a `substance` (normalized name, coerced canonical unit, `type: other`) — capture never blocks on unknown names. Scanning optional (no key → 503 → manual fallback). Supersedes R-CAP-15 on v2. Server tests (parser + scan route, mocked scanner) + web tests (`scanItem`); scan→edit→save + auto-create browser-verified; live vision device-verified. |
| 2026-06-15 | Slice v2-2f (Log capture overhaul, in review): added R-CAP-18/19 + ADR-020; R-CAP-16 → Built. The Log screen replaces the freeform manual form with **photo**, **voice**, and **recent-item** capture. New seam: `IntakeRecognizer` (`recognize.ts`/`recognize_anthropic.ts` — Claude vision/text). New routes: `POST /api/intake/recognize` (recognizes + `ilike`-matches the catalog), `GET /api/intake/recent-items`. **Voice is transcribed on-device (Web Speech API)** and sent to recognize as text — Anthropic stays the only API key (matches v1's on-device-dictation model). The client recognizes → quick-confirm → log against a match / **save as new item** / log by name. Recognition optional (503 + graceful UI). Server tests (pure parser + routes with mocked seam) + web client tests; recent→confirm→log + 503 fallback browser-verified; live photo/voice device-verified. |
| 2026-06-15 | Slice v2-2g (Log capture refinements, in review): ADR-021 refines the v2-2f Log screen from phone-use feedback. **Photo** → **Camera** (`capture`) + **Upload** (album/files); **voice** drops the Web Speech API for the **OS keyboard's own dictation** — a focused "Speak / type" field (also a typing fallback) sent to `/api/intake/recognize` as text; the confirm card gains a **live catalog search** (`GET /api/items?search=`) to attach to any existing item or save as new; the **unit** field becomes a dropdown (`web/src/lib/units.ts`). Web-only change (no server routes touched); `unitOptions` test added. Camera/upload, dictation field, live search, unit dropdown browser-verified; live photo/voice device-verified. |
| 2026-06-16 | API hardening (R-NFR-7): the `/api` namespace now always returns JSON. Unmatched `/api/*` paths used to fall through to the SPA's `index.html` (HTML 200); added an `api.all("*")` JSON `404` catch-all in `server/app.ts` (after auth, before the static SPA fallback). Non-API paths still serve the PWA shell. DB-free test in `app_test.ts`. |
| 2026-06-16 | Slice v2-2h (fuzzy item search): ADR-022. `listItems` search moves from strict `ILIKE` to **pg_trgm trigram word-similarity** (`word_similarity(q,name) > 0.3` OR substring fallback, ranked best-first) so recognized/typed names match stored items despite punctuation, word order, and small mishears (e.g. "pre workout" → "Dope-Max Pre-Workout"). Migration `0003_item_search_trgm.sql` enables `pg_trgm` + a GIN trigram index on `input_item.name`. **Note:** originally PR #53, which merged into its stacked base instead of `main` and never landed — re-landed directly on `main`. Run `deno task migrate` on the deployed DB. Integration test + verified. |
| 2026-06-16 | Log confirm-card refinement (R-CAP-18): a found catalog match is **selected by default**, and logging against an existing item sets the intake `displayName` to **the item's own name** (not the transcribed text) — e.g. "pre workout" → "Dope-Max Pre-Workout". Pure helper `web/src/lib/log.ts` (`selectedName`) + unit tests; browser-verified end to end. Web-only. |
| 2026-06-16 | Add Item photo parity (R-CAP-17): the Add Item screen gains **Camera** + **Upload** photo sources (two file inputs, like the Log screen) in place of the single camera-only picker. Web-only; browser-verified. |
| 2026-06-16 | Phase v2-A started (R-RT-7, ADR-023): **"Ask LLM"** screen (`/ask`) + `POST /api/ask`. Preset + free-text questions (typed or OS-keyboard-dictated) answered by Claude over the **last 48h** of check-ins + intake, gathered server-side; SDK-isolated `Advisor` seam (pure prompt builder + `AnthropicAdvisor`). Optional (503 without a key; prod already has one). The answer renders as **sanitized Markdown** (`marked` + `DOMPurify`). Server + web tests; Postman updated; browser-verified (screen, 503 fallback, Markdown render); live answers device-verified. |
| 2026-06-17 | Overview chart fix: fan the mood/energy/focus series by a small per-series vertical offset (`seriesOffset`, `web/src/lib/chart.ts`) + a card-colored dot halo, so equal ratings no longer overlap into a single dot. Unit-tested helper; browser-verified. Web-only. |
| 2026-06-17 | Add Item: tappable "Your items" rows open a popup listing the item's ingredients (substance + amount + unit) via the existing `GET /api/items/:id`. New `getItem` client + test; modal closes on ✕/backdrop/Esc. Web-only; browser-verified. |
| 2026-06-17 | Resolver fix (R-DOM-4): an item logged in **"serving"/"servings"** units now resolves its ingredients (→ breakdown + daily totals) even when the item's serving unit is named differently ("2 scoops", "serving (22.5g)"); a serving means one default serving (`db/resolve.ts`). Pure test added. Existing frozen events need a re-log to pick it up. |
| 2026-06-17 | Resolver: **partial servings** scale proportionally — "0.5 serving" ≡ "1 scoop" of a "2 scoops" serving, each contributing **half** the actives to daily totals. `convert` tolerates singular/plural count units (`db/resolve.ts`). Pure resolver tests (incl. prod "Bulk Electrolyte Powder") + a DB integration test (two half-servings sum to one); "spoon" added to the unit dropdown. |
| 2026-06-17 | R-CAP-20: the Log confirm card constrains the **unit dropdown** to a chosen item's serving / measurement unit (`serving` + the item's own unit) — log in servings or the item's unit, not an incompatible one; freeform keeps the full list. `servingUnitChoices` (`web/src/lib/log.ts`) + tests; browser-verified. Web-only. |
| 2026-06-17 | Log **"save as a new item"** now opens the **full editable item form** (serving + ingredients, auto-filled from recognition), same as Add Item after a scan; the editor was extracted into a shared `ItemDraftForm` (+ unit-tested `itemDraft` converters), so saving creates the detailed item and logs it. Web-only; both screens browser-verified. |
| 2026-06-17 | Log recognizer extracts a **stated time** (R-CAP-8/R-CAP-18): the client sends its local `now`, Claude resolves "coffee at 10am" → a local `when`, which pre-fills the **When** field. `server/recognize.ts`/`recognize_anthropic.ts`; parser + web client tests; browser-verified. |
| 2026-06-17 | R-CAP-17: the shared item editor gains an optional **grams/ml canonical serving** ("1 steak = 250 g") so foods can be logged by count/serving **or** by weight — both resolve (R-DOM-4). `ItemDraft` carries `canonQty`/`canonUnit` via the existing `servingSchema`; unit tests; browser-verified end to end. Web-only. |
| 2026-06-17 | R-VIEW-8: tapping a substance in the Overview totals opens a **popup of contributing inputs** (protein → Steak 25 g, Eggs 20 g), computed client-side from resolved amounts (`substanceContributions`, `web/src/lib/totals.ts`). Unit-tested; browser-verified. Web-only. |
| 2026-06-17 | R-CAP-21 (+ADR-024): **Add Item by barcode** — key-less Open Food Facts lookup (`POST /api/items/barcode`, `ProductLookup` seam + pure `parseOffProduct`) → editable draft → save; `BarcodeDetector` camera scan on the Add Item screen (camera-only). Unit/integration/web tested; live + browser verified. |
| 2026-06-17 | R-CAP-21 (+ADR-025): barcode camera decode moved from native `BarcodeDetector` to **ZXing** (lazy-loaded) so scanning works on **iOS** (WebKit has no `BarcodeDetector`). |
| 2026-06-17 | R-CAP-21 (+ADR-026): barcode capture switched from live-video scan to **photographing** the barcode + decoding the still (ZXing), which locks on reliably on phones. |
| 2026-06-17 | R-CAP-19: recent-item chips on the Log screen show an emoji icon (`iconForInput`, as on the Overview timeline). |
| 2026-06-17 | R-CAP-17: the item editor's unit fields became **dropdowns** (serving / canonical-serving / ingredient units), matching the Log confirm card (R-CAP-20). |
| 2026-06-17 | R-VIEW-1: the Overview chart **zooms to the waking hours (08:00–22:00)** (x-axis 8·12·16·20·22h), widening only for an out-of-window outlier so nothing is clipped. |
