# TrackEverything — Requirements

> **Status:** Living document. See [Maintenance](#maintenance) for how this
> stays current. **Last updated:** 2026-06-15 (ADR-022: fuzzy item search via
> pg_trgm — recognized/typed names match stored items despite punctuation/mishears) **Owner:** aerohit
> **Companion doc:** [ARCHITECTURE.md](ARCHITECTURE.md)

Each requirement has a stable ID (`R-<area>-<n>`) so it can be referenced from
the architecture doc, commits, and the changelog. Don't renumber existing IDs;
retire them with status `Removed` instead.

| Status     | Meaning                               |
| ---------- | ------------------------------------- |
| `Proposed` | Agreed in principle, not yet designed |
| `Designed` | Reflected in ARCHITECTURE.md          |
| `Built`    | Implemented and working               |
| `Removed`  | No longer in scope (kept for history) |

---

## 1. Vision

A single place to capture everything in daily life that affects **mood, energy,
and focus** — nutrition, hydration, sleep, supplements, breathwork, workouts,
stressors — and then analyze it to find patterns and take corrective action.

The product succeeds only if **capture is nearly frictionless** and the
**analysis produces insight the user would not have reached unaided**.

## 2. Scope & users

| ID        | Requirement                                                                                             | Status   |
| --------- | ------------------------------------------------------------------------------------------------------- | -------- |
| R-SCOPE-1 | Single user (the owner). No multi-tenant, sharing, or onboarding flows required.                        | Proposed |
| R-SCOPE-2 | Architecture should not actively preclude opening to other users later, but no work is spent on it now. | Proposed |
| R-SCOPE-3 | Personal items and baselines (e.g. "my coffee", "my stack") may be hardcoded/personalized.              | Proposed |

## 3. Capture

| ID       | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Status   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R-CAP-1  | One unified place captures all categories of input (no per-tracker silos).                                                                                                                                                                                                                                                                                                                                                                                                                              | Built    |
| R-CAP-2  | Support **voice** capture: speak freely, system extracts structured records.                                                                                                                                                                                                                                                                                                                                                                                                                            | Built    |
| R-CAP-3  | Support **manual** entry as an alternative to voice.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Built    |
| R-CAP-4  | Support **device/integration** capture (see §4).                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Proposed |
| R-CAP-5  | **Quick-log templates** for repeated habits (coffee, protein shake) — one tap/utterance logs a pre-defined event with sensible defaults.                                                                                                                                                                                                                                                                                                                                                                | Built    |
| R-CAP-6  | Quick-log is reachable with minimal friction (Lock/Home screen, Siri, later a watch complication).                                                                                                                                                                                                                                                                                                                                                                                                      | Built    |
| R-CAP-7  | **Dual timestamps** on every event: `occurred_at` (when it happened) and `recorded_at` (when it was logged). After-the-fact entry must preserve this distinction.                                                                                                                                                                                                                                                                                                                                       | Built    |
| R-CAP-8  | Voice/LLM resolves relative time references ("at 10am", "an hour ago", "this morning") into `occurred_at`.                                                                                                                                                                                                                                                                                                                                                                                              | Built    |
| R-CAP-9  | Before saving extracted records, show a **confirmation card** with one-tap edit. Errors must be cheap to correct.                                                                                                                                                                                                                                                                                                                                                                                       | Built    |
| R-CAP-10 | A single utterance may produce **multiple events** ("coffee and my magnesium" → 2 records).                                                                                                                                                                                                                                                                                                                                                                                                             | Built    |
| R-CAP-11 | Capture works **offline**; records sync when connectivity returns.                                                                                                                                                                                                                                                                                                                                                                                                                                      | Proposed |
| R-CAP-12 | Each event records its **source/provenance** (voice, manual, Whoop, …) and a confidence/uncertainty flag for inferred fields (esp. inferred times).                                                                                                                                                                                                                                                                                                                                                     | Built    |
| R-CAP-13 | Log a multi-ingredient supplement (e.g. sleep stack, pre-workout) by its **product name alone**, as a single quick entry — without re-entering ingredients each time.                                                                                                                                                                                                                                                                                                                                   | Built    |
| R-CAP-14 | Define a supplement **product's ingredient list once** (per ingredient: name, amount, unit); it is reused for every log of that product. Support a servings/dose multiplier per log.                                                                                                                                                                                                                                                                                                                    | Built    |
| R-CAP-15 | Populate a product's ingredient list by **uploading a photo** of the supplement-facts / ingredients label; the system extracts the structured ingredient list for confirmation/edit (image capture modality).                                                                                                                                                                                                                                                                                           | Built    |
| R-CAP-16 | **Photo food logging:** photograph a meal; the system recognizes the food, **estimates calories + macros** (protein/carbs/fat) and a portion, and logs it. On v2 this is realized by the Log capture flow (R-CAP-18, [ADR-020](ARCHITECTURE.md#adr-020)): the recognizer returns estimated nutrients the user reviews before saving. The MVP's meal-picker (breakfast/lunch/dinner/snack) UX is not carried over; nutrition is LLM-estimated (see [ADR-013](ARCHITECTURE.md#adr-013)). | Built |
| R-CAP-17 | **Add Item by label photo (v2):** the "Add Item" screen takes/uploads a photo of a product label; Claude vision scans the **whole ingredients panel** and returns an **editable draft** item (name, kind, type, serving, one row per active) for the user to correct, then **Save** persists it as a reusable `input_item`. Unknown actives **auto-create** a `substance` (normalized name, coerced canonical unit, `type: other`) so the entire label is captured. Scanning is optional — with no model key the screen falls back to manual entry. Supersedes R-CAP-15 on the v2 stack. ([ADR-019](ARCHITECTURE.md#adr-019)) | Built |
| R-CAP-18 | **Log capture overhaul (v2):** the Log screen captures an intake in one of three ways — **photo** of a meal/drink (**Camera** or **Upload** from the album), **Speak / type** (a focused text field the user dictates into with the **OS keyboard's own mic**, or types), or one tap on a **recent item**. Photo/phrase are recognized by Claude into a name + quantity + unit + estimated nutrients; the **quick-confirm** card (editable name, qty, **unit dropdown**, time) has a **live fuzzy catalog search** (trigram, so "dope max pre-workout" finds "Dope-Max Pre-Workout") so the user can attach the intake to any existing item, **save it as a new item** (recognized draft), or log by name. The freeform manual form is removed. Anthropic is the only API key — recognition 503s with a friendly message when unset; voice/typing and recent need no server key. ([ADR-020](ARCHITECTURE.md#adr-020), [ADR-021](ARCHITECTURE.md#adr-021)) | Built |
| R-CAP-19 | **Quick re-log:** the Log screen lists the **top ~10 most recently logged distinct items** (by item, or by name for freeform logs), each one tap to re-log with its last quantity/unit. ([ADR-020](ARCHITECTURE.md#adr-020)) | Built |

## 4. Data sources & integrations

| ID      | Requirement                                                                                                                  | Status   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| R-SRC-1 | **Whoop** integration for sleep and workout intensity (recovery, strain, detailed sleep).                                    | Proposed |
| R-SRC-2 | **Manual / voice** is a first-class source and the system is fully usable with no wearable.                                  | Proposed |
| R-SRC-3 | Integrations are **pluggable** — new sources (Apple Watch/HealthKit, Oura, …) can be added later without reworking the core. | Proposed |
| R-SRC-4 | Ingested device data lands in the same unified event log as manual/voice entries.                                            | Proposed |

## 5. Subjective check-ins (mood / energy / focus)

| ID       | Requirement                                                                                                            | Status   |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| R-SUBJ-1 | Capture subjective **mood, energy, focus** on a simple scale (e.g. 1–5). These are the outcome variables for analysis. | Built    |
| R-SUBJ-2 | **Scheduled prompts** nudge for a quick check-in at configured times of day.                                           | Built    |
| R-SUBJ-3 | **On-demand** check-in: log a state any time, especially when something shifts (anxious, foggy, great).                | Built    |
| R-SUBJ-4 | (Optional) Offer to attach a quick rating right after logging an event, to strengthen cause→effect links.              | Proposed |

## 5b. Capture domains (v2 — the data-model overhaul)

The v2 rewrite re-frames capture as **8 domains, each its own typed entity** (Drizzle table +
shared Zod schema + Postgres enums), replacing the single event log of the MVP. Functional
requirements above are unchanged; this is how the data is **modelled and stored**. See
[ARCHITECTURE §4b](ARCHITECTURE.md#4b-data-model-v2--per-domain-entities) and
[ADR-016](ARCHITECTURE.md#adr-016). The domains: **Inputs**, **Behaviors & Interventions**,
**Exposures**, **Body Signals / Biometrics**, **Subjective State**, **Performance Outputs**,
**Events / Stressors / Wins**, **Context**.

| ID       | Requirement                                                                                                                                                                                                    | Status   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R-DOM-1  | Capture is modelled as **8 domains, each its own typed entity** (typed columns + Postgres enums + a shared Zod schema), not a single `events` table with untyped `fields`. Supersedes the unified-log model.   | Built    |
| R-DOM-2  | **Subjective State** entity (domain 5): **immutable readings** — one row per `(kind, rating)` where `kind` ∈ {mood, energy, focus} (a single discriminator column, extensible to more states) and `rating` is 1–5; optional note; `recorded_at` only; **no edit/delete** (ADR-017). A check-in rates one or more states at once. First built. | Built |
| R-DOM-3  | The other seven domains (Inputs, Behaviors & Interventions, Exposures, Body Signals, Performance Outputs, Events/Stressors/Wins, Context) are each their own entity, delivered as later phases.                 | Proposed |
| R-DOM-4  | **Inputs** domain ("anything put into the body"): a **mutable** `intake_event` records one thing consumed at a time, optionally linked to a reusable `input_item` (product/recipe/simple) decomposed into `substance`s (+ child items); logging freezes a per-event `resolved_amount` snapshot in canonical units (confidence-tagged), which rolls up into daily per-substance totals. Elemental substances only (ADR-018). | Built    |

## 6. Real-time analysis

Operates over the recent timeline (last 24–48h) and answers questions in the
moment.

| ID     | Requirement                                                                                                | Status |
| ------ | ---------------------------------------------------------------------------------------------------------- | ------ |
| R-RT-1 | "**Why** am I feeling X right now?" — diagnose current anxiety/low mood against recent inputs.             | Built  |
| R-RT-2 | "**What can I do right now** to fix it?" — actionable suggestions (breathwork, food, walk, stop caffeine). | Built  |
| R-RT-3 | "**What's dragging me down?**" — attribute current low energy/focus/mood to recent inputs.                 | Built  |
| R-RT-4 | "**Should I do X right now?**" — decision support (another coffee? work out given recovery?).              | Built  |
| R-RT-5 | "**How will I feel later?**" — forward-looking prediction given today's inputs so far.                     | Built  |
| R-RT-6 | Real-time answers cite the specific events/data they reasoned from.                                        | Built  |

## 7. Retrospective analysis (pattern finding)

| ID      | Requirement                                                                                                                                                                                                                | Status   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R-PAT-1 | Link low energy/mood/focus back to nutrition, sleep, workouts, supplements, stressors, etc.                                                                                                                                | Proposed |
| R-PAT-2 | Compute **daily aggregates** (e.g. total caffeine, last-caffeine time, sleep hours, workout load) and outcome metrics.                                                                                                     | Built    |
| R-PAT-3 | Run **correlation / lagged analysis** between inputs and outcomes (including next-day effects).                                                                                                                            | Proposed |
| R-PAT-4 | Have the LLM **interpret** the statistical findings into plain-language insights and suggested experiments.                                                                                                                | Proposed |
| R-PAT-5 | Analyze supplement intake at **two granularities**: whole-product and decomposed into ingredients (e.g. total magnesium summed across all products/foods; correlate a single ingredient such as L-theanine with outcomes). | Built    |

## 8. Overviews & reporting

| ID       | Requirement                                                                                                                                                                    | Status   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| R-VIEW-1 | **Daily** overview of inputs and subjective state.                                                                                                                             | Built    |
| R-VIEW-2 | **Weekly** overview with trends.                                                                                                                                               | Proposed |
| R-VIEW-3 | **Monthly** overview with trends and surfaced patterns.                                                                                                                        | Proposed |
| R-VIEW-4 | **Event timeline / history** list view: scroll recent events in time order (backed by a `GET /events` list endpoint).                                                          | Proposed |
| R-VIEW-5 | Timeline **food** rows show a dish-level summary (**"Meal — item"**, e.g. "Lunch — Salad"), not the raw ingredient list; the dish name is clickable to reveal its ingredients. | Built    |
| R-VIEW-6 | The UI supports **light and dark appearance**: follows the system setting by default with a manual toggle (System / Light / Dark), persisted on the device.                    | Built    |
| R-VIEW-7 | The UI is **responsive for phone and desktop**: mobile-first single column; an adaptive two-pane layout on wide screens (the app is used on both a phone and a computer).       | Built    |

## 9. Non-functional requirements

| ID      | Requirement                                                                                                                                                                                | Status   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| R-NFR-1 | **Low-code-first**: prove the capture→store→analyze loop with minimal custom code before building a polished app. Owner has limited coding experience and will run, not author, most code. | Proposed |
| R-NFR-2 | **Cloud LLM is acceptable** for analysis (e.g. Claude API). Raw timeline data may be sent to a hosted model.                                                                               | Proposed |
| R-NFR-3 | Capture latency must feel instant; analysis may take a few seconds.                                                                                                                        | Proposed |
| R-NFR-4 | Data is durable and backed up; the event log is the system of record.                                                                                                                      | Proposed |
| R-NFR-5 | LLM/API cost should be tracked and kept reasonable for a single user.                                                                                                                      | Proposed |
| R-NFR-6 | iPhone is the primary capture surface.                                                                                                                                                     | Built    |

## 10. Testing & quality

| ID       | Requirement                                                                                                                                                                         | Status   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R-TEST-1 | All non-trivial code has **unit tests** covering its logic (validation, time resolution, template expansion, aggregation math, correlation math).                                   | Proposed |
| R-TEST-2 | Each endpoint and pipeline has **integration tests** exercising the real path (HTTP → DB roundtrip; adapter → event log).                                                           | Proposed |
| R-TEST-3 | LLM extraction and analysis are covered by **fixture/golden tests**: known transcripts/timelines → expected structured output or asserted properties (e.g. "answer cites event X"). | Built    |
| R-TEST-4 | External services (Claude, Whoop) are **mockable** for deterministic tests; a small separate live suite exercises the real services.                                                | Built    |
| R-TEST-5 | **CI runs all tests**; a phase is not approvable while tests are red.                                                                                                               | Built    |
| R-TEST-6 | Every phase has explicit **acceptance criteria** the owner verifies before the next phase begins (see [ROADMAP.md](ROADMAP.md)).                                                    | Proposed |

## 11. Delivery process

| ID       | Requirement                                                                                                                    | Status   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| R-PROC-1 | Work is delivered in **small, independently testable phases**; each ends in an **owner approval gate** before the next starts. | Proposed |
| R-PROC-2 | The phase plan is maintained in [ROADMAP.md](ROADMAP.md) and kept in sync with these docs.                                     | Proposed |

## 12. Open questions

Tracked here until resolved, then moved into a requirement or an ADR.

- Q1: Whoop data path — HealthKit sync vs. Whoop API directly? (leaning API for
  richer fields)
- Q2: ~~Exact subjective scales~~ — **Resolved (Phase 5):** 1–5 integer ratings,
  separate mood/energy/focus (`fields.rating`).
- Q3: Scheduled check-in cadence and times?
- Q4: Retention/units conventions (caffeine in mg, sleep in minutes, etc.) — to
  be fixed in the data dictionary.
- Q5: Ingredient canonicalization & unit normalization (R-CAP-14, R-PAT-5) —
  mapping product-listed compounds to canonical ingredients and elemental
  amounts (e.g. "magnesium glycinate 1000mg" → elemental magnesium), so the same
  ingredient aggregates across products and foods. Depth TBD; start simple
  (verbatim ingredient + unit) and deepen later.

---

## Maintenance

This document is kept current by an explicit process, not by hope. See
`CLAUDE.md` at the repo root for the binding rule. In short:

1. **Every feature add/change/removal updates this file in the same change** —
   add/modify/retire the relevant `R-*` row and bump `Last updated`.
2. Status transitions (`Proposed → Designed → Built → Removed`) are part of the
   change that causes them.
3. Material decisions are also logged as an ADR in
   [ARCHITECTURE.md](ARCHITECTURE.md#decision-log-adrs).
4. The [Changelog](#changelog) below gets a one-line entry.

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-11 | Initial requirements captured from scoping conversation.                                                                                                                                                                                                                                                                     |
| 2026-06-11 | Added Testing & quality (R-TEST-_) and Delivery process (R-PROC-_); added ROADMAP.md.                                                                                                                                                                                                                                        |
| 2026-06-12 | Phase 0 approved → R-TEST-4/5 to Built. Added composite-supplement reqs (R-CAP-13/14/15, R-PAT-5) + open question Q5.                                                                                                                                                                                                        |
| 2026-06-12 | Phase 1 approved → R-CAP-1/7/12 to Built (event-log schema).                                                                                                                                                                                                                                                                 |
| 2026-06-12 | Phase 2 approved → R-CAP-3 to Built (POST /events manual capture).                                                                                                                                                                                                                                                           |
| 2026-06-12 | Phase 3 approved → R-CAP-2/8/9/10 + R-TEST-3 to Built (voice extraction).                                                                                                                                                                                                                                                    |
| 2026-06-12 | Phase 4 approved → R-CAP-5/6 to Built (quick-log templates).                                                                                                                                                                                                                                                                 |
| 2026-06-12 | Phase 4b approved → R-CAP-13/14/15 + R-PAT-5 to Built (composite supplements).                                                                                                                                                                                                                                               |
| 2026-06-12 | Phase 5: resolved Q2 (1–5 separate mood/energy/focus).                                                                                                                                                                                                                                                                       |
| 2026-06-13 | Phase 5 approved → R-SUBJ-1/2/3 to Built (subjective check-ins).                                                                                                                                                                                                                                                             |
| 2026-06-13 | Phase 6 approved → R-RT-3/6 to Built (real-time /ask + citations).                                                                                                                                                                                                                                                           |
| 2026-06-13 | Phase 7 approved (PR #9 merged) → R-RT-1/2/4/5 to Built (all real-time questions).                                                                                                                                                                                                                                           |
| 2026-06-13 | Phases 8–10 deferred; building Phase 11 (web UI) first. R-NFR-6 → Designed (PWA). See ADR-012.                                                                                                                                                                                                                               |
| 2026-06-13 | Phase 11 (web UI / PWA daily slice) approved (PR #11 merged) → R-NFR-6 → Built.                                                                                                                                                                                                                                              |
| 2026-06-13 | Phase 8 still deferred; building Phase 9 (daily overview) next.                                                                                                                                                                                                                                                              |
| 2026-06-13 | Phase 9 approved (PR #12 merged) → R-PAT-2/R-VIEW-1 to Built (daily overview).                                                                                                                                                                                                                                               |
| 2026-06-13 | Added R-VIEW-4 (event timeline/history view); planned UI completion slices 11a–11d in ROADMAP.                                                                                                                                                                                                                               |
| 2026-06-13 | Bugfix (R-CAP-8): mentioned clock times are interpreted in the user's local timezone. `/capture` takes `tzOffsetMinutes`; the model reports a local wall-clock and `extract.ts` applies the offset deterministically.                                                                                                        |
| 2026-06-13 | Phase 11b: UI surfaces for manual single-event entry (R-CAP-3), check-in note (R-SUBJ-1), and quick-log servings/fields override (R-CAP-14) — no new endpoints.                                                                                                                                                              |
| 2026-06-13 | Phase 11c: Manage UI — label-scan→product (R-CAP-15 image path), create product/template (R-CAP-13/14, R-CAP-5), ingredient-breakdown preview (R-PAT-5) — no new endpoints.                                                                                                                                                  |
| 2026-06-13 | Phase 11d: `GET /events` list endpoint + Timeline view (R-VIEW-4), cited-event detail + window control in Ask (R-RT-6), cookie-backed token.                                                                                                                                                                                 |
| 2026-06-14 | UI-test fixes: daily overview uses the user's **local** day (R-PAT-2/R-VIEW-1, `tzOffsetMinutes`); Timeline auto-refreshes + shows the note; product quick-logs are self-describing (`item`=name).                                                                                                                           |
| 2026-06-14 | PWA reorganised into four tabbed screens (Home / Overview / Ask / Manage) — navigation/IA only, no requirement change.                                                                                                                                                                                                       |
| 2026-06-14 | Cold-start mitigation (R-NFR-3): warm the DB connection at isolate startup; `GET /health?warm=1` DB ping + an hourly/post-deploy warm-up workflow (prevents the Supabase 7-day pause).                                                                                                                                       |
| 2026-06-14 | Overview (R-VIEW-1): `/overview` returns subjective `points` (the UI plots mood/energy/focus separately) and a `products` list (composite supplements by name; the UI shows names with a click-to-open ingredients pop-up instead of the summed rollup).                                                                     |
| 2026-06-14 | Added R-CAP-16 (photo food logging: recognize → itemize → estimate calories+macros → edit amount or enter calories). LLM-estimated nutrition (ADR-013); nutrition-database integration deferred to a later phase. Daily calorie/macro totals added to `/overview` (R-PAT-2). New `photo` source. Phase 12.                   |
| 2026-06-14 | Reliability (R-NFR-3): fixed a `DEPLOYMENT_TIMED_OUT` crash-loop — an uncaught `PostgresError` (statement timeout on a stale pooled connection) was crashing the isolate. Added a global `unhandledrejection` guard + DB `connect_timeout`/`idle_timeout`/`max_lifetime`. Documented region-pinning and preview-env scoping. |
| 2026-06-14 | Overview IA (R-VIEW-1, ADR-014): split **perceptions** (mood/energy/focus) from **actions/inputs**. Perceptions now render only in a dedicated chart card; the Timeline lists actions only (filters out mood/energy/focus); the Today summary drops the perception averages.                                                 |
| 2026-06-14 | Added R-VIEW-5 (Built): Timeline food rows show a dish-level "Meal — item" summary (e.g. "Lunch — Salad") instead of the raw ingredient list; the dish name is clickable to open an ingredients pop-up. The food-scan prompt now also returns a dish-level `item` name used as the label.                                    |
| 2026-06-14 | R-VIEW-5 polish: meals and event categories now show an emoji icon (🍳/🥗/🍽/🍎 meals, 💊 supplement, 💪 workout, 😴 sleep, etc.) on the timeline, the food meal picker, and the Today supplements list. UI-only; no API change.                                                                                              |
| 2026-06-15 | Added R-VIEW-6 (Built): UI restyled to a clean light/dark theme with a single indigo accent (replacing the dark-only "Aurora" gradient look); follows the system appearance by default with a System/Light/Dark header toggle persisted as `te_theme`. UI-only; no API change.                                               |
| 2026-06-15 | v2 maturity rewrite kicked off (ADR-015/016). Added R-DOM-1..3: capture re-modelled as 8 typed per-domain entities (replacing the unified event log), Subjective State (mood/energy/focus, 1–5, snapshot) built first. Stack moves to Hono + SvelteKit + Drizzle + Zod on the same Deno Deploy + Supabase infra; clean-slate database at cutover. Functional requirements unchanged. |
| 2026-06-15 | PR #35 review (ADR-017): refined R-DOM-2 — Subjective State is now **immutable readings**, a single `kind` discriminator column (extensible to more states) + `rating`, `recorded_at` only. Dropped the per-dimension columns, `occurred_at`, and the edit-tracking/soft-delete columns; the API is create + read only. |
| 2026-06-15 | v2-1b: added R-VIEW-7 (responsive phone+desktop UI) — the SvelteKit PWA is mobile-first single column with an adaptive two-pane desktop layout; carries the R-VIEW-6 light/dark theme. |
| 2026-06-15 | v2-2 (Inputs) data layer: added R-DOM-4 + ADR-018. Unified `intake_event` over reusable `input_item`s (product/recipe/simple) decomposed into seeded `substance`s; pure resolution engine freezes a per-event `resolved_amount` snapshot (canonical units, confidence) → daily totals. Mutable events; elemental substances only (compound→elemental deferred). Data + resolution + repo + tests; API/UI to follow. |
| 2026-06-15 | v2-2e (Add Item by label photo, in review): added R-CAP-17 + ADR-019. "Manage" → **Add Item**; the manual item form is replaced by photo capture/upload → `POST /api/items/scan` (Claude vision via `ItemScanner`/`AnthropicItemScanner`, SDK-isolated; tolerant pure parser) → an **editable draft** → Save. Unknown actives **auto-create** a `substance` (normalized name, coerced canonical unit, `type: other`). Scanning optional (503 → manual fallback). Supersedes R-CAP-15 on v2. Server + web tests added; scan→edit→save + auto-create browser-verified. |
| 2026-06-15 | v2-2f (Log capture overhaul, in review): added R-CAP-18/19 + ADR-020; R-CAP-16 → Built. The Log screen replaces the freeform manual form with three capture modes — **photo**, **voice**, and **recent items** (`GET /api/intake/recent-items`). Photo/phrase → `POST /api/intake/recognize` (Claude behind an `IntakeRecognizer` seam) → recognized name/qty/unit + estimated nutrients **matched** against the catalog → a quick-confirm to log against a match, **save as a new item**, or log by name. **Voice is transcribed on-device (Web Speech API)** and arrives as text, so Anthropic stays the only API key. Recognition optional (503 + graceful UI). Server (parser + recognize/recent routes, mocked seam) + web client tests; recent→confirm→log + 503 fallback browser-verified; live photo/voice device-verified. |
| 2026-06-15 | v2-2g (Log capture refinements, in review): ADR-021 refines R-CAP-18 from phone-use feedback. Photo splits into **Camera** (`capture`) + **Upload** (album/files); **voice** drops the Web Speech API for the **OS keyboard's own dictation** (a focused "Speak / type" field — also a typing fallback) sent to recognize as text; the confirm card gains a **live catalog search** (`GET /api/items?search=`) to attach to any existing item or save as new; the **unit** field becomes a dropdown of common display units (`web/src/lib/units.ts`). Web `unitOptions` test added; camera/upload, dictation field, live search, unit dropdown browser-verified; live photo/voice device-verified. |
| 2026-06-15 | v2-2h (fuzzy item search, in review): ADR-022. The catalog search (recognize auto-match + confirm-card search) moves from strict `ILIKE` to **pg_trgm trigram word-similarity** (`word_similarity(q,name) > 0.3` OR substring, ranked best-first), so "dope max pre-workout" matches "Dope-Max Pre-Workout". Migration `0003_item_search_trgm.sql` enables `pg_trgm` + a GIN trigram index on `input_item.name`. Integration test (punctuation/word-order, partial, misspelling, and a non-match) + browser-verified. |
