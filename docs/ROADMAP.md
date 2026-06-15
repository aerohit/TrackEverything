# TrackEverything — Roadmap (phased, gated build plan)

> **Status:** Living document. **Last updated:** 2026-06-15 (v2-1a in review; ADR-017: Subjective State as immutable (kind, rating) readings)
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
> Built on a `v2-overhaul` branch; the MVP is tagged `v1-mvp` and production keeps running it
> until the **v2-X cutover**. Everything under the "v1 (MVP)" divider is kept for history.

Capture is re-modelled into **8 domains** (R-DOM-1), each its own entity, delivered one phase at
a time. Only **Subjective State** is built first (R-DOM-2); the rest are documented below.

### Phase v2-1 — Foundation + Subjective State ◐
- **Goal:** Stand up the new stack and ship the first domain end to end — check in mood/energy/focus and see them charted.
- **Delivered in two slices** (like the MVP's Phase 11): **v2-1a** — foundation + data + API (done, in review); **v2-1b** — the SvelteKit PWA (next).
- **v2-1a status (in review):** repo layout (`server/` Hono, `db/` Drizzle, `shared/` Zod; `web/` to come) + root `deno.json` + a second CI job. The `subjective_state` entity (immutable `(kind, rating)` readings — ADR-017; migration `db/migrations/0001`), typed repository, and the Hono API (`POST`/`GET /api/checkins`, token-guarded, Zod-validated) — **unit + integration tests green against real Postgres** (7 passed; the integration test covers auth, batch create sharing one `recorded_at`, list + `kind` filter + bad-param 400s, and immutability — no edit/delete route).
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

- **v2-2 — Inputs** — food, drinks, supplements, medication, caffeine, hydration. Re-homes the MVP's food ([ADR-013](ARCHITECTURE.md#adr-013)) and composite-supplement/ingredient model ([ADR-010](ARCHITECTURE.md#adr-010)) into typed entities.
- **v2-3 — Behaviors & Interventions** — sleep habits, workouts, meditation, breathwork, work blocks, social actions.
- **v2-4 — Exposures (Environment & Context)** — light, weather, noise, temperature, social environment, work pressure.
- **v2-5 — Body Signals / Biometrics** — sleep metrics, HRV, soreness, digestion, pain, illness, hunger. (Natural home for the deferred Whoop adapter, ex-Phase 8.)
- **v2-6 — Performance Outputs** — deep work, learning, gym performance, social actions, habit adherence.
- **v2-7 — Events / Stressors / Wins** — arguments, rejections, deadlines, good conversations, achievements.
- **v2-8 — Context** — time, place, day type, season, current goal, experiment phase.
- **Expand Subjective State** (small) — add the remaining dimensions (stress, confidence, motivation, calmness, playfulness) as columns when the owner wants them.

### Phase v2-A — Cross-domain analysis ☐ (documented)
Re-frames MVP Stage C (real-time questions) and Phase 10 (correlation) over the typed entities: assemble a cross-domain timeline by unioning the entities, compute correlations (inputs/behaviors/exposures → subjective/performance outcomes), and have the LLM interpret. Carries forward R-RT-* and R-PAT-*.

### Phase v2-X — Cutover ☐ (documented)
Tag `v1-mvp`; run the fresh Drizzle migrations on the production Supabase DB (drops the MVP tables — owner accepted the clean slate); deploy the v2 service; point the domain; tag `v2`.

---

## v1 (MVP) — superseded by v2 (kept for history)

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
