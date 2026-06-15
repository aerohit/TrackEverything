# TrackEverything — Architecture & Design Decisions

> **Status:** Living document. See [Maintenance](#maintenance) for how this stays current.
> **Last updated:** 2026-06-15 (ADR-018: Inputs — intake events over reusable items, with a resolved substance snapshot)
> **Companion doc:** [REQUIREMENTS.md](REQUIREMENTS.md) · [ROADMAP.md](ROADMAP.md)

This document records *how* we build TrackEverything and *why*. Requirement IDs
(e.g. `R-CAP-7`) reference [REQUIREMENTS.md](REQUIREMENTS.md). Every significant
or reversible-with-cost decision is captured as an **ADR** in the
[Decision Log](#decision-log-adrs).

---

## 1. Guiding principles

1. **Capture friction is the enemy.** Every design choice optimizes for the
   smallest possible effort to log something.
2. **One unified event log.** Everything — a voice note, a Whoop sleep record, a
   mood check-in — is a row in the same timeline. (R-CAP-1, R-SRC-4)
   **(v1; superseded by [ADR-016](#adr-016).** v2 models each capture domain as its
   own typed entity. The unifying idea moves up a level: one app and one capture
   flow, but per-domain storage instead of one `events` table.)
3. **Least code first.** Prove value with managed services and minimal custom
   code before investing in a native app. The owner runs code, doesn't author it.
   (R-NFR-1)
4. **The LLM normalizes; the human confirms.** Extraction tolerates messy input;
   a confirmation step keeps data trustworthy. (R-CAP-9)
5. **Statistics first, LLM second for long-term patterns.** Don't ask an LLM to
   find correlation in raw logs; compute it, then have the LLM interpret.

## 2. System overview

```
                         ┌──────────────────────────────────────┐
   Capture surfaces      │              Core (backend)           │     Analysis
 ┌──────────────────┐    │                                       │
 │ iOS Shortcut     │    │   ┌───────────────┐                   │   ┌──────────────────┐
 │  (voice/manual)  │───▶│   │  Extraction   │  Claude API       │   │ Real-time        │
 ├──────────────────┤    │   │  pipeline     │◀─────────────────▶│   │ analysis         │
 │ Quick-log        │───▶│   └──────┬────────┘                   │   │ (last 24–48h)    │
 │  templates       │    │          ▼                            │   └──────────────────┘
 ├──────────────────┤    │   ┌───────────────┐                   │   ┌──────────────────┐
 │ Source adapters  │───▶│   │  Event log    │  (Postgres)       │   │ Retrospective    │
 │  (Whoop, …)      │    │   │  system of    │───▶ aggregates ──▶│   │ stats + LLM      │
 └──────────────────┘    │   │  record       │                   │   │ interpretation   │
                         │   └───────────────┘                   │   └──────────────────┘
                         └──────────────────────────────────────┘   ┌──────────────────┐
                                                                     │ Daily/weekly/    │
                                                                     │ monthly overviews│
                                                                     └──────────────────┘
```

## 3. Technology choices (Phase 1 — least-code-first)

| Layer | Choice | Rationale | ADR |
|---|---|---|---|
| UI | **PWA** served by the backend ([`ui/app.ts`](../backend/ui/app.ts), at `/`) | Real iPhone app via "Add to Home Screen"; no native toolchain | [ADR-012](#adr-012) |
| Capture (secondary) | iOS **Shortcuts** (voice + manual input) | No Xcode/App Store; Lock Screen + Siri one-tap + automations | [ADR-002](#adr-002) |
| Transcription | Apple on-device dictation first; Whisper as upgrade | Free, fast, offline; LLM layer absorbs errors | [ADR-005](#adr-005) |
| Database | **Supabase** (hosted Postgres) | Managed, durable, backed up; system of record | [ADR-003](#adr-003) |
| Compute | **Deno Deploy** (single router service, [`main.ts`](../backend/main.ts)) | Runs our `Deno.serve` app directly; one deploy, no idle-pause | [ADR-011](#adr-011) |
| Extraction & analysis | **Claude API** from an Edge Function | Cloud LLM acceptable (R-NFR-2); does both extraction and analysis | [ADR-004](#adr-004) |
| Overviews | Lightweight web dashboard (later in Phase 1) | Simplest way to render daily/weekly/monthly without an app | — |
| Native app | Deferred to Phase 3 | Heavy lift; only after value is proven | [ADR-001](#adr-001) |

## 4. Data model — the event log

> **v1 (MVP) — superseded by the v2 per-domain model in [§4b](#4b-data-model-v2--per-domain-entities) and [ADR-016](#adr-016).** The unified-log design below was the MVP, kept for history; v2 replaced it with one typed entity per capture domain (clean-slate database). The v1 code (`backend/`) has since been removed — recoverable via the `v1-mvp` git tag.

Single append-only table of typed events. **Implemented** in
[`backend/migrations/0001_event_log.sql`](../backend/migrations/0001_event_log.sql);
conventions in [`backend/docs/data-dictionary.md`](../backend/docs/data-dictionary.md).
Sketch:

| Column | Notes |
|---|---|
| `id` | UUID |
| `category` | food, drink, supplement, sleep, workout, breathwork, mood, energy, focus, stressor, … |
| `occurred_at` | When it actually happened (R-CAP-7) |
| `recorded_at` | When it was logged (R-CAP-7) |
| `occurred_at_confidence` | high/inferred — flags after-the-fact / fuzzy times (R-CAP-12) |
| `source` | voice, manual, quicklog, whoop, … (R-CAP-12) |
| `fields` | JSON of structured, category-specific fields (e.g. `{caffeine_mg, dose_mg, duration_min, intensity, rating}`) |
| `raw_text` | The original utterance/note, kept verbatim |
| `template_id` | If created from a quick-log template (R-CAP-5), references it |

**Design notes**
- JSON `fields` keeps the schema flexible across many categories without a table
  per category; a **data dictionary** (units + canonical field names) is
  maintained alongside the migration to keep aggregation reliable (Q4).
- Quick-log templates and personal items ("my coffee" → defaults) live in their
  own small tables and are referenced from events.
- Subjective check-ins (mood/energy/focus) are just events with those categories
  and a `rating` field — same pipeline, no special-casing. (R-SUBJ-1)
- **Composite supplements** are a kind of personal item: a `product` with an
  `ingredients` list (per ingredient: name, amount, unit, optional canonical
  ingredient). A logged supplement event references the product (+ optional
  `servings` multiplier in `fields`); it is **not** duplicated into per-ingredient
  rows at capture time. (R-CAP-13, R-CAP-14, [ADR-010](#adr-010))
- **Ingredient-level analysis** comes from the aggregation layer **expanding** a
  logged product into ingredient amounts (`servings × per-ingredient amount`),
  keyed by a **canonical ingredient name** so the same ingredient sums across
  products and foods. Whole-product analysis uses the event as-is. (R-PAT-5)
  **Implemented (Phase 4b):**
  [`backend/migrations/0002_products_ingredients.sql`](../backend/migrations/0002_products_ingredients.sql)
  + [`backend/src/products.ts`](../backend/src/products.ts) (`expandToIngredients`);
  label-photo extraction in `extractIngredientsFromImage`.
- The **data dictionary** is extended with a canonical-ingredient vocabulary +
  unit normalization (open question Q5).

## 4b. Data model (v2) — per-domain entities

> **The v2 direction ([ADR-016](#adr-016)).** Replaces §4. Not yet built — the first
> entity (Subjective State) lands in roadmap phase **v2-1**.

Capture is organized into **8 domains, each its own typed entity/table** with explicit,
range-checked columns (no shared `events` table, no untyped `fields` jsonb). Each domain's
shape is also a **Zod schema in `shared/`**, used by the Hono API, the SvelteKit client,
and any LLM-output validation. Closed vocabularies are **Postgres enums**. Mutable entities
carry dual timestamps (`occurred_at` / `recorded_at`) plus `updated_at` and a `deleted_at`
soft-delete column; entities that are **immutable by nature** (e.g. Subjective State —
[ADR-017](#adr-017)) keep only `recorded_at`.

| # | Domain | Examples |
|---|---|---|
| 1 | **Inputs** | food, drinks, supplements, medication, caffeine, hydration |
| 2 | **Behaviors & Interventions** | sleep habits, workouts, meditation, breathwork, work blocks, social actions |
| 3 | **Exposures (Environment & Context)** | light, weather, noise, temperature, social environment, work pressure |
| 4 | **Body Signals / Biometrics** | sleep metrics, HRV, soreness, digestion, pain, illness, hunger |
| 5 | **Subjective State** | mood, energy, focus, stress, confidence, motivation, calmness, playfulness |
| 6 | **Performance Outputs** | deep work, learning, gym performance, social actions, habit adherence |
| 7 | **Events / Stressors / Wins** | arguments, rejections, deadlines, good conversations, achievements |
| 8 | **Context** | time, place, day type, season, current goal, experiment phase |

**First entity — `subjective_state` (domain 5, phase v2-1).** Modelled as **immutable readings**
([ADR-017](#adr-017)): each row is one `kind` (which subjective state) + a 1–5 `rating`, stamped
once at `recorded_at`. A check-in rating several states at once is just several readings recorded
together — a batch insert sharing one `recorded_at`. New subjective states are added by extending
the `subjective_kind` enum — **no new columns**. The first build tracks `mood` / `energy` / `focus`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `kind` | `subjective_kind` enum | mood / energy / focus (extend the enum to track more) |
| `rating` | integer | 1–5, range-checked |
| `note` | text, nullable | optional; per check-in (shared across its readings) |
| `recorded_at` | timestamptz | the only timestamp — rows are immutable (no update or delete) |

The perceptions-vs-actions split (ADR-014) is now **inherent in the schema** — Subjective
State is simply its own entity, separate from the input/behavior domains — rather than a
presentation-time filter over a shared log.

## 4c. Data model (v2) — Inputs (domain 1)

> **Built: data + resolution layer ([ADR-018](#adr-018), R-DOM-4).** API + UI follow.

"Input = anything intentionally put into the body." Two layers — a fast human-level log and a
rich analytical decomposition:

- **`substance`** — the analytical vocabulary (seeded; elemental forms only for now): `name`,
  `substance_type` (macronutrient/mineral/electrolyte/vitamin/stimulant/…), `canonical_unit`
  (g/mg/mcg/ml/kcal/iu), `aliases[]`.
- **`input_item`** — a reusable thing (`kind`: product | recipe | simple). Not forced into one
  category: `primary_type` + `roles[]` (a smoothie is drink + food + meal). Carries a default
  serving (display + canonical) and a `version`. Mutable, soft-deletable.
- **`item_component`** — composition; each row is **exactly one of** a `substance` (actives /
  nutrients) **or** a `child_item` (recipe ingredients), with an amount + unit per serving.
- **`intake_event`** — one thing consumed at one time. Optional `item_id` (freeform logs allowed),
  display quantity/unit + resolved canonical quantity/unit, `confidence`, `context_tags[]`
  (pre_workout, fasted, …). **Mutable** (edit + soft delete) for progressive refinement.
- **`resolved_amount`** — the analytical **snapshot** frozen per event (canonical units), produced
  by the resolver ([`db/resolve.ts`](../db/resolve.ts)): expand item × quantity → substances,
  recursing recipes, scaling by serving, normalizing mass/volume/energy. Re-computed on edit, never
  rewritten by later item edits. Powers daily per-substance totals.

So the user logs **objects** ("1 scoop pre-workout") while the app analyses **components**
(200 mg caffeine, 5 g creatine, …). Quantities keep both a display form and a canonical form; every
event and amount carries a confidence. Compound→elemental conversion (magnesium glycinate → Mg) is
deferred; tags are `text[]` for now.

## 5. Source adapter layer

A thin, pluggable interface so new integrations slot in without touching the core
(R-SRC-3). Each adapter's job: pull from its source, map into event-log rows,
write them with `source` set. Whoop is the first adapter (R-SRC-1); HealthKit and
others follow the same contract. Whoop access path (HealthKit sync vs Whoop API)
is open question Q1 — leaning Whoop API for recovery/strain/detailed sleep.

## 6. Extraction pipeline (voice/manual → structured events)

> **Implemented (Phase 3):** [`backend/functions/capture/index.ts`](../backend/functions/capture/index.ts)
> (`POST /capture`) + [`backend/src/extract.ts`](../backend/src/extract.ts). Candidates
> are returned unsaved; the confirm step persists them via the `POST /events` batch
> form. Time resolution is deterministic (model emits a time hint; our code resolves
> it against "now"). Details in [`backend/docs/voice-capture.md`](../backend/docs/voice-capture.md).

1. Capture surface sends `{transcript, recorded_at, source}` to an Edge Function.
2. Function calls Claude with **structured outputs / tool-calling** constrained to
   a JSON schema, plus context: the **category taxonomy** and the user's **known
   items** (for shorthand like "my coffee"). (R-CAP-2, R-CAP-10)
3. Claude returns an array of candidate events, resolving relative times into
   `occurred_at` and flagging inferred ones. (R-CAP-8, R-CAP-12)
4. Candidates are returned to the surface for a **confirmation card** before
   persisting. (R-CAP-9)

Why this shape: transcription only has to be roughly right because the LLM
normalizes against known items and context (ADR-005).

**Label-photo ingredient extraction (product definition).** To define a
supplement product's ingredient list (R-CAP-15), a photo of the
supplement-facts / ingredients label is sent to Claude with **image input** plus
a JSON schema for `{ingredient, amount, unit}[]`. The result is shown on a
confirmation card and saved onto the **product** — once, not per log. This reuses
the same normalize-then-confirm shape as the voice pipeline, with the image as
the source instead of a transcript.

## 7. Real-time analysis

> **Implemented (Phase 6, first question):** [`backend/functions/ask/index.ts`](../backend/functions/ask/index.ts)
> (`POST /ask`), [`backend/src/context.ts`](../backend/src/context.ts) (timeline
> assembler with `[E#]` citation refs), [`backend/src/ask.ts`](../backend/src/ask.ts)
> (templates + citation resolution). Phase 7 adds the remaining questions over the
> same path.

- A **context assembler** pulls the last 24–48h of events into a compact,
  chronological timeline (plus the user's baselines).
- The five real-time questions (R-RT-1..5) are **prompt templates** over that same
  assembled context, so they share one retrieval path.
- The whole window fits in context, so no statistics are needed here — Claude
  reasons over the raw timeline directly and must **cite the events** it used
  (R-RT-6).

## 8. Retrospective analytics

Two-stage, because LLMs are poor at finding statistical signal in raw logs:

1. **Aggregate**: scheduled job rolls events into daily features + outcome metrics
   (R-PAT-2). Composite supplements are **expanded into ingredient amounts** (per
   the product's ingredient list) before rolling up, so per-ingredient totals and
   correlations are available alongside whole-product ones (R-PAT-5).
2. **Correlate**: compute correlations and **lagged** relationships (next-day
   effects) between inputs and outcomes (R-PAT-3).
3. **Interpret**: feed the *correlations* (not the raw logs) to Claude for
   plain-language insight + suggested experiments (R-PAT-4).

Overviews (R-VIEW-1..3) read from the same aggregate tables.

## 9. Testing strategy

Every phase ships with tests; a phase is not approvable while tests are red
(R-TEST-1..6). Test pyramid:

- **Unit** — pure logic in isolation: payload validation, relative-time
  resolution (with a fixed "now"), template→event expansion, aggregation math,
  correlation/lag math. Fast, no network. (R-TEST-1)
- **Integration** — the real path end to end against a test database: HTTP →
  Edge Function → Postgres roundtrip; source adapter → event log. Run against a
  local/ephemeral Supabase instance. (R-TEST-2)
- **LLM fixture / golden tests** — checked-in transcripts and timelines with
  expected structured outputs or asserted properties (e.g. extraction yields 2
  events with the right categories; a real-time answer cites event X). Asserts
  on structure/properties, not exact prose, to stay robust. (R-TEST-3)

**External services are mockable.** Claude and Whoop sit behind thin interfaces so
tests inject canned responses for determinism; a small, separately-run **live
suite** exercises the real APIs (and catches contract drift). (R-TEST-4)

**CI gate.** All deterministic tests run in CI on every change; green is a
precondition for an approval gate. The live suite runs on demand. (R-TEST-5)

See [ADR-007](#adr-007) for rationale.

## 10. Roadmap / phasing

The **bite-sized, owner-approved phase plan** lives in [ROADMAP.md](ROADMAP.md).
Each phase is independently testable and ends in an approval gate (R-PROC-1,
[ADR-008](#adr-008)). High-level arc:

| Stage | Goal |
|---|---|
| Foundation | Project + test harness, event-log schema |
| Capture | Manual, voice→structured, quick-log, check-ins |
| Analysis | Real-time questions over the recent timeline |
| Integrations | Whoop adapter |
| Overviews & insights | Daily/weekly/monthly + correlation engine |
| Native app | Polished SwiftUI capture (deferred) |

## 11. Non-goals (for now)

- Multi-user / sharing (R-SCOPE-1).
- On-device-only inference — cloud LLM is accepted (R-NFR-2).
- Building a native app before the loop is proven (ADR-001).

---

## Decision Log (ADRs)

Append-only. Each decision is immutable once `Accepted`; to change one, add a new
ADR that **supersedes** it (and note the supersession on the old one). Format:
context → decision → consequences.

### ADR-001
**Title:** Defer the native iOS app; start with a low-code walking skeleton.
**Status:** Accepted (2026-06-11). **Client choice superseded by [ADR-012](#adr-012)** —
the Phase 11 client is a PWA, not native SwiftUI; native is now an optional future.
**Context:** Owner has limited coding experience and wants to build collaboratively
(R-NFR-1). A native app with Whoop OAuth, widgets, and a backend is a large lift
that risks stalling before the payoff.
**Decision:** Phase 1 uses Shortcuts + Supabase + Claude; native app deferred to
Phase 3 after value is proven.
**Consequences:** Faster path to a working loop; some capture polish (widgets,
watch) waits. Architecture must avoid choices that block a later native client.

### ADR-002
**Title:** Use iOS Shortcuts as the Phase 1 capture surface.
**Status:** Accepted (2026-06-11). **Refined by [ADR-012](#adr-012)** — the PWA is now the
primary UI; Shortcuts remain a secondary, no-UI capture path (one-tap, automations).
**Context:** Need frictionless voice/manual capture without app development.
**Decision:** Build capture as Shortcuts that take voice/text input and POST to a
backend endpoint.
**Consequences:** No App Store/Xcode; Siri + Lock Screen ready. Limited custom UI
(e.g. rich confirmation cards) until the native app exists.

### ADR-003
**Title:** Supabase (hosted Postgres) as backend and system of record.
**Status:** Accepted (2026-06-11). **Compute host superseded by [ADR-011](#adr-011)**
— Supabase remains the hosted Postgres / system of record, but the functions run on
Deno Deploy rather than Supabase Edge Functions.
**Context:** Want durable storage, auth, and serverless functions with no infra to
run (R-NFR-1, R-NFR-4).
**Decision:** Postgres holds the event log and aggregates; Edge Functions host the
extraction and analysis endpoints.
**Consequences:** Owner deploys via dashboard/CLI rather than authoring servers.
Postgres also serves the later analytics workload.

### ADR-004
**Title:** Claude API for both extraction and analysis.
**Status:** Accepted (2026-06-11)
**Context:** Cloud LLM is acceptable (R-NFR-2); need NL→structured extraction and
timeline reasoning.
**Decision:** Use Claude via Edge Functions, with structured outputs for
extraction and prompt templates for the real-time questions.
**Consequences:** Per-call cost to monitor (R-NFR-5); requires sending timeline
data to a hosted model (accepted).

### ADR-005
**Title:** Apple on-device dictation first; LLM layer absorbs transcription error.
**Status:** Accepted (2026-06-11)
**Context:** Transcription struggles with supplement names, brands, dosages.
**Decision:** Start with built-in dictation; rely on the extraction LLM (with
known-items context) to normalize. Whisper is an upgrade path if accuracy is
insufficient.
**Consequences:** Free/offline/fast to start; a confirmation step (R-CAP-9) covers
residual errors.

### ADR-006
**Title:** Single unified event log with JSON `fields`, dual timestamps.
**Status:** Accepted (2026-06-11)
**Context:** Many heterogeneous categories; need flexibility plus the
occurred/recorded distinction (R-CAP-1, R-CAP-7).
**Decision:** One append-only events table; category-specific data in a JSON
column; `occurred_at` + `recorded_at` + confidence flag on every row; a data
dictionary governs units/field names.
**Consequences:** Highly flexible; aggregation relies on discipline in the data
dictionary rather than DB constraints.

### ADR-007
**Title:** Test pyramid with mockable external services and a CI gate.
**Status:** Accepted (2026-06-11)
**Context:** Owner requires unit and integration tests for all code (R-TEST-1,2)
and approves each phase before the next. LLM/external calls are non-deterministic
and cost money.
**Decision:** Unit tests for pure logic; integration tests against an ephemeral
test DB; LLM/Whoop behind thin interfaces so they can be mocked, asserting on
output structure/properties via fixtures; a small separate live suite for real
APIs. All deterministic tests run in CI and must be green before an approval gate.
**Consequences:** Deterministic, fast feedback and protected approval gates; some
upfront effort building fixtures and interface seams. Live behavior is covered by
a smaller, on-demand suite rather than in the main loop.

### ADR-008
**Title:** Deliver in small, owner-approved phases.
**Status:** Accepted (2026-06-11)
**Context:** Owner wants to test and approve bite-sized increments before moving
on (R-PROC-1).
**Decision:** Work is sliced into small, independently testable phases tracked in
[ROADMAP.md](ROADMAP.md); each ends in an explicit acceptance gate with criteria
the owner verifies. No phase starts before the prior one is approved.
**Consequences:** Slower nominal throughput but continuous verification and low
risk of building the wrong thing. Requires keeping ROADMAP.md in sync with the
two core docs.

### ADR-018
**Title:** Model Inputs as intake events over reusable items, with a resolved substance snapshot.
**Status:** Accepted (2026-06-15). Realizes the first of the v2 per-domain entities (R-DOM-4) under
[ADR-016](#adr-016); re-homes the MVP's food ([ADR-013](#adr-013)) and composite-supplement
([ADR-010](#adr-010)) ideas into this domain.
**Context:** "Input = anything intentionally put into the body" — food, drink, supplement,
medication, caffeine, electrolytes, alcohol, pre-workout, smoothie… all just **types of input**.
The user logs simple objects ("pre-workout") but analysis needs the components (caffeine, creatine,
sodium…). We need fast human-level capture **and** rich analytical decomposition, stable history,
honest confidence, and time-awareness — without forcing messy real-world items into one category.
**Decision:** Two layers ([§4c](#4c-data-model-v2--inputs-domain-1)). An **`intake_event`** (mutable,
soft-deletable) records one thing consumed at a time, optionally linked to a reusable **`input_item`**
(`product` | `recipe` | `simple`) composed via **`item_component`** of **`substance`s** (the seeded
analytical vocabulary, elemental units) and/or **child items** (recipe ingredients). On log, a pure
resolver ([`db/resolve.ts`](../db/resolve.ts)) expands item × quantity into substance amounts in
canonical units — recursing recipes, scaling by serving, normalizing mass/volume/energy — and freezes
them per event as **`resolved_amount`**, the snapshot that powers daily per-substance totals and stays
stable when items are later edited (`item_version` is retained for explicit recompute). Items use
`primary_type` + `roles[]` (not one rigid category); quantities keep display + canonical forms; every
event and amount carries a `confidence`. Freeform logs (no item, optional manual substance amounts)
are allowed for fast/rough capture and later refinement.
**Consequences:** simple capture with granular, time-aware analysis from a single log; history is
stable yet recomputable. Trade-offs: resolution depends on unit reconciliation (unreconcilable →
no resolved amounts + `confidence: low`); **compound→elemental conversion is deferred** (substances
are elemental); effect tags are `text[]` for now. Built data+resolution-first (this slice); the
Hono API and SvelteKit capture/overview UI follow as later slices.

### ADR-017
**Title:** Model Subjective State as immutable (kind, rating) readings — a single discriminator
column, no edit/delete.
**Status:** Accepted (2026-06-15). **Refines [ADR-016](#adr-016)** for the Subjective State entity
(its general "dual timestamps + edit-tracking + soft-delete" maturity columns do not apply here).
**Context:** ADR-016's first sketch of `subjective_state` used a dedicated column per dimension
(`mood`/`energy`/`focus`) plus `occurred_at` + `created_at`/`updated_at`/`deleted_at`. The owner
wants (a) to add **more subjective states over time without schema churn**, and (b) to treat a
recorded feeling as a **fact that never changes**.
**Decision:** Model Subjective State as **immutable readings**. One row = one `kind` (a Postgres
enum discriminator — extend it to add states; **no per-dimension columns**) + a 1–5 `rating` +
optional `note`, stamped once at `recorded_at`. There is **no `occurred_at`, `updated_at`,
`created_at`, or `deleted_at`**, and the API exposes **create + read only** (no edit/delete routes).
A check-in that rates several states at once is several readings inserted together, sharing one
`recorded_at`. The shared Zod enum (`SUBJECTIVE_KINDS`) is the app-side source of truth; the DB
enum mirrors it.
**Consequences:** Adding a subjective state is a one-line enum extension (Zod + an `alter type …
add value` migration) instead of a schema column; readings are append-only, which simplifies the
API and makes the data trustworthy as an audit trail. Trade-offs: a mistaken entry can't be edited
or removed (acceptable per the owner; revisit with a corrective-entry pattern if needed), and "a
check-in" has no grouping row — its readings are associated only by a shared `recorded_at`. This
refines ADR-016 only for Subjective State; other domains may still be mutable with the full
timestamp set.

### ADR-016
**Title:** Replace the unified event log with one typed entity per capture domain.
**Status:** Accepted (2026-06-15). **Refined by [ADR-017](#adr-017)** for the Subjective State
entity (immutable readings; single `kind` column; only `recorded_at`). **Supersedes [ADR-014](#adr-014)** and the unified-event-log
data model in [§4](#4-data-model--the-event-log); **re-homes [ADR-010](#adr-010)** (composite
supplements) and [ADR-013](#adr-013) (food nutrition) into v2 domain entities; **refines
[ADR-006](#adr-006)** (controlled vocabularies move from app-layer checks to Postgres enums + Zod).
**Context:** The MVP stored everything in one `events` table with a `category` and an untyped
jsonb `fields` blob, governed only by a prose data dictionary. That caused silent drift — a
`durationMin` vs `duration_min` key mismatch rolled a workout up to "0 min" with no error — and
made per-category data hard to type, validate, or query. The owner redefined capture as **8
domains**, each with its own attributes, and accepted a clean-slate database.
**Decision:** Drop the single event log. Model capture as **8 domains, each its own typed
entity/table** ([§4b](#4b-data-model-v2--per-domain-entities)) with explicit, range-checked
columns and a **Zod schema in `shared/`** reused by the API, the client, and LLM-output
validation. Closed vocabularies become **Postgres enums**; every entity carries dual timestamps
+ `updated_at` + a `deleted_at` soft-delete. The first entity built is **Subjective State**
(mood/energy/focus; 1–5; snapshot/any-subset; UTC `occurred_at` only — no stored tz offset);
the other seven domains follow as roadmap phases. The production database is **reset clean** at
v2 cutover (owner accepted dropping all MVP data).
**Consequences:** Removes the untyped-`fields` drift class; each domain gets a precise, queryable
schema and shared types end to end. Trade-offs: more tables and per-domain migrations (cheap with
Drizzle), and the cross-domain timeline / correlation work now unions typed entities instead of
scanning one table (handled in the analysis layer). The perceptions-vs-actions split (ADR-014) is
now structural rather than a UI filter.

### ADR-015
**Title:** Rebuild on Hono + SvelteKit + Drizzle + Zod, served as a single Deno Deploy service.
**Status:** Accepted (2026-06-15). **Refines [ADR-012](#adr-012)** (still a PWA, but built with
SvelteKit instead of a hand-written HTML string) and the single `Deno.serve` router in
[ADR-011](#adr-011) (Hono replaces the hand-rolled router; the Deno Deploy + Supabase hosting is
unchanged). Builds on [ADR-009](#adr-009) (Deno + TypeScript stays).
**Context:** The MVP is one `Deno.serve` router ([`main.ts`](../backend/main.ts)) serving a
self-contained HTML-string PWA with inline vanilla JS, plus hand-written SQL and raw migrations.
It meets the functional requirements but is hard to grow: untyped data access, no component
model, no typed migrations. The owner wants a more mature codebase on the **same infrastructure**
(Deno Deploy / console.deno.com + Supabase, free tier).
**Decision:** Rebuild with **Hono** (typed API, middleware, RPC types) for the backend,
**SvelteKit** (Svelte 5) for the PWA, **Drizzle ORM** (typed schema + `drizzle-kit` migrations)
for the data layer, and **Zod** for shared validation (request bodies, row shapes, LLM output).
**One Deno Deploy service** serves the built SvelteKit assets *and* the Hono API on the same
origin (no CORS); Supabase remains Postgres. The repo restructures into `web/` (SvelteKit),
`server/` (Hono + the Deno entrypoint), `db/` (Drizzle schema + migrations), and `shared/` (Zod
schemas), replacing `backend/`. Done on a `v2-overhaul` branch; the MVP is tagged `v1-mvp` and
`main`/production keep running until a deliberate cutover.
**Consequences:** Type safety end to end, real components with a build step, and typed migrations.
Trade-offs: a build pipeline now exists (none before), and SvelteKit ships as static SPA assets
served by Hono (SSR isn't needed for a single-user PWA). The PWA-over-native trade-off of ADR-012
still stands. Hosting, free tier, and the manual-migrate workflow (ADR-011) are unchanged.

### ADR-014
**Title:** Separate "perceptions" (mood/energy/focus) from "actions" in the Overview — perceptions render only in the chart; the timeline lists only actions/inputs.
**Status:** Accepted (2026-06-14). **Superseded by [ADR-016](#adr-016)** — in v2, Subjective State is its own entity, so perceptions are separated from actions/inputs by the schema itself, not by a presentation-time filter over a shared log.
**Context:** mood/energy/focus are the **outcome** variables we ultimately correlate
*against* inputs/actions (food, drink, supplement, sleep, workout, breathwork,
stressor, hydration, note). Listing both in one timeline conflated "what I did" with
"how I felt" and made the timeline noisy; the subjective values are far more legible
as a trend than as log rows.
**Decision:** On the Overview tab, mood/energy/focus ("perceptions") appear **only** in
a dedicated **chart** card (plotted over the day, with the averages as a caption). The
**Timeline** card lists **only actions/inputs** — it filters out the `mood`/`energy`/
`focus` categories. The Today summary no longer prints perception averages (the chart
owns them). No schema change: all remain ordinary events in the log; this is a
presentation/IA split, keyed off category.
**Consequences:** Clear inputs-vs-outcomes separation that also frames the Phase 10
correlation work (actions → perceptions). The timeline filter is **client-side** for now
(it filters the fetched window, which is widened to compensate); if check-in volume ever
crowds actions out of that window, move the filter server-side via a category-exclude
param on `GET /events`.

### ADR-013
**Title:** Estimate food nutrition with the LLM now; defer a nutrition-database integration.
**Status:** Accepted (2026-06-14).
**Context:** Phase 12 logs food from a photo (R-CAP-16) and needs calories + macros per
item. Two sources: (a) Claude vision estimates the nutrition directly, or (b) vision
identifies the food and a nutrition database (USDA FoodData Central / Nutritionix)
supplies precise values. (b) is more accurate but adds an external integration, an API
key/account, food-name matching, and portion mapping — a phase in itself.
**Decision:** Start with **(a) LLM-estimated** calories + macros. The vision call
([`POST /food-scan`](../backend/functions/food_scan/index.ts), prompt in
[`src/food.ts`](../backend/src/food.ts)) returns per-item `amount`/`unit`, `calories`,
`protein_g`/`carbs_g`/`fat_g`, and context `ingredients`. The user **always confirms/edits**
the amount (which rescales the estimate) or types calories directly before saving, so an
imperfect estimate is cheap to correct. Foods persist as `food` events (`source: photo`)
via the existing `POST /events`; the daily overview sums `calories` + macros.
**Consequences:** No new external dependency or key beyond the Anthropic key already in
use; ships now and is verifiable with the mock seam. Trade-off: estimates are approximate
and not reproducible. A **nutrition-database integration is added to the roadmap** as a
later phase that can supersede this ADR (replace or back-stop the estimate), keeping the
same event shape so stored data needn't change.

### ADR-012
**Title:** Build the iPhone UI as a server-served PWA, not a native SwiftUI app.
**Status:** Accepted (2026-06-13). **Supersedes the native-client plan in [ADR-001](#adr-001)**
(native is now an optional future, not the planned Phase 11 client). Refines
[ADR-002](#adr-002): the PWA is the primary UI; Shortcuts remain a secondary surface.
**Context:** Phase 11 was "native SwiftUI." A native app can't be built/run/tested
or signed in this environment, so it would be unverified code outside the CI/test
discipline used for every other phase — and ADR-001 deferred native precisely until
value is proven (it isn't yet, with no real data). A PWA is in our existing Deno/TS
stack, served by the same service, verifiable, and works on iPhone via "Add to Home
Screen" with no App Store / signing / Apple Developer account.
**Decision:** A self-contained mobile web page ([`backend/ui/app.ts`](../backend/ui/app.ts))
served at `/` and `/app` by [`main.ts`](../backend/main.ts). It calls the same-origin
API with the `INGEST_TOKEN` held in `localStorage`. Voice uses the iOS keyboard's
dictation into a text field → `POST /capture`. Built in slices, daily-use first.
**Consequences:** A real, verifiable iPhone UI now, no native toolchain. Trade-off:
no offline queue (R-CAP-11), Home-Screen widgets, or Apple Watch — those remain the
case for a future native app if the PWA proves the value. Token in `localStorage` is
acceptable for a single-user personal tool (same trust level as the Shortcuts).

### ADR-011
**Title:** Host the backend as a single Deno service on Deno Deploy; Supabase provides Postgres.
**Status:** Accepted (2026-06-13). **Supersedes the compute-host choice in [ADR-003](#adr-003)**
(Supabase remains the hosted Postgres / system of record).
**Context:** The eight functions share code under `backend/src` and are injectable
handler factories. Supabase Edge Functions want a `supabase/functions/*` layout
(restructure, per-function deploy, `verify_jwt`). Deno Deploy runs our `Deno.serve`
app directly with no restructure, one deploy, one URL, and no idle-pause.
**Decision:** Add a single router entrypoint ([`backend/main.ts`](../backend/main.ts))
that dispatches by path to the existing handlers; deploy it to Deno Deploy. Supabase
hosts Postgres, reached via its connection pooler (driver set to `prepare: false`).
Production secrets live in Deno Deploy's env; migrations are run from a laptop against
`DATABASE_URL`. See [`backend/docs/deploy.md`](../backend/docs/deploy.md).
**Consequences:** Minimal change; handlers untouched and host-agnostic, so moving to
Edge Functions later remains open. Two vendors (Deno Deploy + Supabase) instead of
one. No auto-migrate on deploy — a manual `deno task migrate` step after schema
changes.

### ADR-010
**Title:** Model composite supplements as products with an ingredient list; analyze at both levels.
**Status:** Accepted (2026-06-12). **Re-homed by [ADR-016](#adr-016)** — composite supplements move into the v2 **Inputs** domain entities; the dual-granularity (product vs ingredient) idea carries over.
**Context:** Multi-ingredient supplements (sleep stacks, pre-workout) should be
logged quickly by product name, but analysis needs ingredient-level resolution —
total magnesium across all sources, or correlating a single ingredient with
outcomes (R-CAP-13/14, R-PAT-5).
**Decision:** Store products with a structured ingredient list (defined once,
optionally via label-photo vision extraction — R-CAP-15). Log events reference the
product + optional `servings`. The aggregation layer expands product → ingredient
amounts keyed by a canonical ingredient; whole-product analysis uses the event
directly.
**Consequences:** Fast capture and dual-granularity analysis without duplicating
data at capture time. Requires a canonical-ingredient vocabulary + unit
normalization (Q5) and adds an image-input extraction path. The core event-log
shape is unchanged — products/ingredients are reference tables (ADR-006 stands).

### ADR-009
**Title:** Deno + TypeScript as the backend runtime and test runner.
**Status:** Accepted (2026-06-11)
**Context:** Need a concrete runtime for the backend functions and a low-friction
test setup (R-NFR-1, R-TEST-5). Supabase Edge Functions run on Deno (ADR-003).
Node is installed locally but diverges from the Edge runtime.
**Decision:** Use Deno + TypeScript for `backend/`. The LLM and DB sit behind thin
seams (`ClaudeClient`, `pingDatabase`) imported lazily so unit tests stay offline.
Deno's built-in test runner gives the "one command" gate (`deno task test`); CI is
GitHub Actions with a Postgres service container for the integration test.
**Consequences:** Zero rework moving functions to Edge Functions; single-binary
toolchain, no `node_modules`. Ties the project to Deno's tooling conventions.

---

## Maintenance

Kept current by the rule in `CLAUDE.md` (repo root). In short:

1. Any architectural change updates the relevant section **and** adds/supersedes
   an ADR in the same change; bump `Last updated`.
2. ADRs are append-only and immutable once Accepted — supersede, don't edit.
3. Cross-references to requirement IDs are kept accurate when requirements move.
