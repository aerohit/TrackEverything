# TrackEverything — Architecture & Design Decisions

> **Status:** Living document. See [Maintenance](#maintenance) for how this stays current.
> **Last updated:** 2026-06-18 (ADR-036: slimmed intake_event — dropped canonical qty/unit, confidence, notes)
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
- **`input_item`** — a reusable thing (`kind`: product | recipe | simple | stack — see
  [ADR-034](#adr-034)/[ADR-035](#adr-035) for why `kind` is the only descriptive column we keep).
  Carries a default serving (display + canonical). Mutable, soft-deletable.
- **`item_component`** — composition; each row is **exactly one of** a `substance` (actives /
  nutrients) **or** a `child_item` (recipe ingredients), with an amount + unit per serving.
- **`intake_event`** — one thing consumed at one time. Optional `item_id` (freeform logs allowed),
  display `quantity`/`unit`, `source`, `precision` (precise/rough), `context_tags[]`
  (pre_workout, fasted, …), `unresolved`. **Mutable** (edit + soft delete) for progressive refinement.
  Carries no canonical quantity or confidence of its own — the per-substance `resolved_amount`
  snapshot holds the analysable amounts + confidence ([ADR-036](#adr-036)).
- **`resolved_amount`** — the analytical **snapshot** frozen per event (canonical units), produced
  by the resolver ([`db/resolve.ts`](../db/resolve.ts)): expand item × quantity → substances,
  recursing recipes, scaling by serving, normalizing mass/volume/energy. Re-computed on edit, never
  rewritten by later item edits. Powers daily per-substance totals.

So the user logs **objects** ("1 scoop pre-workout") while the app analyses **components**
(200 mg caffeine, 5 g creatine, …). The event keeps the human display quantity; the resolver
normalizes to canonical units inside `resolved_amount`, where each amount carries a confidence.
Compound→elemental conversion (magnesium glycinate → Mg) is deferred; tags are `text[]` for now.

**Diagrams.** The full table-and-FK layout (all 7 tables, including the isolated `subjective_state`
and `quick_preset`) is in [diagrams/er-diagram.svg](diagrams/er-diagram.svg). How a single log flows
catalog → event → resolver → frozen snapshot → daily totals is in
[diagrams/intake-dataflow.svg](diagrams/intake-dataflow.svg).

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

### ADR-034
**Title:** Drop `input_item.primary_type` and `roles`; `kind` is the only structural axis.
**Status:** Accepted (2026-06-18). Updates R-DOM-4. Migration `0009`. **The "keep `brand`"
part is superseded by [ADR-035](#adr-035)** — `brand` was later dropped too.
**Context:** `input_item` carried three classifying columns. A usage audit found only `kind`
drives behaviour — and within `kind`, only `stack` vs. not (it gates loading a stack's member
items, the manage-screen split, and the single-vs-per-member capture choice; product/recipe/simple
are descriptive provenance, never branched on). `primary_type` was display-only metadata (a label +
a scan/recognize default), branched on nowhere. `roles[]` was written as `[]` everywhere and never
read — a reserved-for-future field that never came.
**Decision:** Remove `primary_type` (and its `input_primary_type` enum) and `roles` from the schema,
the Zod contract, the scan/barcode/recognize drafts, the DTOs, and the Add-Item / resolve forms.
Keep `kind` (incl. `stack`) and `brand`. The catalog screens now show `kind` (+ `brand` when present)
instead of `kind · primary_type`.
**Consequences:** A smaller, honest contract — no fields masquerading as meaningful. If a
food/drink/supplement taxonomy is ever needed (e.g. to filter the Overview), it returns as a
deliberate, used column rather than inferred-but-ignored metadata. Drop is destructive but the data
was unused; the migration is idempotent.

### ADR-035
**Title:** Drop `input_item.version`, `notes`, `brand`, and `intake_event.item_version`.
**Status:** Accepted (2026-06-18). Supersedes the "keep `brand`" clause of [ADR-034](#adr-034).
Updates R-DOM-4, R-CAP-21. Migration `0010`.
**Context:** Continuing the [ADR-034](#adr-034) audit. `version` snapshotted into
`intake_event.item_version` at log time, but was **never incremented** on item edit and
`item_version` was **never read** — item versioning was never actually implemented. `notes` was
accepted at create, shown read-only in the detail modal, and had no edit path (write-once, never
changed). `brand` was display-only metadata populated by the scan/barcode drafts and shown next to
`kind` — useful-looking, but nothing depends on it and the owner opted to drop it.
**Decision:** Remove all four columns. Drop the version-snapshot read in `createIntakeEvent`, the
`notes`/`version` fields from `InputItemDetail`, `brand` from `InputItemSummary` + `CreateItem`, the
brand population in `scan.ts`/`barcode.ts` (and the now-dead `firstBrand` helper), and the brand/notes
display on the manage screen.
**Consequences:** `input_item` is now name + `kind` + serving + Quick-Capture fields; the catalog row
shows just `kind`. If true item versioning is ever needed it returns as a real, incremented-and-read
column — not a dormant default. Destructive but the data was unused; the migration is idempotent.

### ADR-036
**Title:** Slim `intake_event` — drop `canonical_quantity`/`canonical_unit`, `confidence`, `notes`.
**Status:** Accepted (2026-06-18). Updates R-CAP-12, R-CAP-27, R-DOM-4. Migration `0011`.
**Context:** Auditing `intake_event`. The event-level **`canonical_quantity`/`canonical_unit`** were a
materialized cache of the normalized amount, but the analytical pipeline never reads them — daily
totals and the macro/micro table sum **`resolved_amount`** (the frozen per-substance snapshot, also in
canonical units). **`confidence`** was never displayed and never used in any calculation; the only
thing that set it to a non-default was the fuzzy-time path (R-CAP-27), and `precision` (precise/rough,
shown as the `~` tag) is the live exactness signal we keep. **`notes`** had no UI to set or display it.
**Decision:** Drop all four columns. The resolver (`computeResolution`) stops emitting event canonical
fields and an event confidence; `resolved_amount.confidence` (and its `intake_confidence` enum) stay.
The fuzzy-time confirm card keeps its "· approx" hint but no longer logs a low-confidence flag.
`source`, `precision`, `context_tags`, `unresolved` are unaffected.
**Consequences:** `intake_event` is now display-level capture + provenance; all analysable numbers live
on `resolved_amount`, removing a redundant cache that could drift from the snapshot. Confidence-aware
ranges, if built later, derive from `resolved_amount`. Destructive but the data was unread; idempotent.

### ADR-033
**Title:** Occasional / "unresolved" items — capture by name now, resolve nutrition later.
**Status:** Accepted (2026-06-18). Realizes R-CAP-30 (phase 1, capture) and R-CAP-31 (phase 2, resolve) — **both shipped**.
Migration `0008`.
**Context:** Logging something not in your regulars (a restaurant dish, a one-off snack) must be
1–3 seconds and must not force you to define an item first — but we still want it on the timeline and,
eventually, in the totals. The existing recognizer confirm card already fuzzy-matches the catalog and offers
"log by name"; what was missing is a way to (a) capture by name manually without the LLM, (b) flag a
by-name log as needing nutrition, and (c) fill that nutrition in later.
**Decision:** Add a boolean **`intake_event.unresolved`** (default false). The Log screen gains a **manual
"Type item"** mode: type a name (+ amount/unit) → the existing confirm card runs the trigram fuzzy search
(`GET /api/items?search=`) and **pre-selects the best match** (suggest "log as <item>"); choosing "log by
name" instead logs with `unresolved: true` and no resolved amounts, so it **contributes nothing to totals**
(honest) and shows an "unresolved" tag on the Overview. **Resolution (phase 2)** reuses the existing
mutable-event machinery (`PATCH /api/intake/:id`, ADR-018, which re-resolves): (a) link an existing item =
PATCH `{itemId}`; (b) save as a regular item = `POST /api/items` then PATCH `{itemId}`; (c) enter nutrients
= PATCH `{resolved:[…]}`; each also clears `unresolved`. No new resolve endpoint is needed.
**Consequences:** occasional items are captured instantly and never block on item definition, while the
totals stay honest (unresolved = not counted) until you choose to resolve. Reuses fuzzy search + the confirm
card + PATCH re-resolution, so the surface area is small. Additive migration with a default (no backfill).
Trade-offs: an unresolved item is invisible to analysis until resolved (by design — we don't fabricate
numbers); "guessed" macros for unresolved items (an alternative the owner mentioned) are deferred. Pure
flagging is integration-tested; the manual-capture → fuzzy-suggest → unresolved → Overview-exclusion path is
browser-verified.

### ADR-032
**Title:** Rough-vs-precise logging + a photo/voice portion picker (capture honesty).
**Status:** Accepted (2026-06-18). Phase **v2-C4**; the precision flag is the bit deferred from C0
([ADR-028](#adr-028)). Realizes the capture side of R-CAP-25. Migration `0007`.
**Context:** Photo/voice logs are estimates; treating them as exact as a measured scoop is dishonest and
will mislead analysis. We want to mark estimates and make portion-setting fast, without yet building the
full confidence-aware totals.
**Decision:** Add an `intake_precision` enum (`precise`, `rough`) + a non-null `intake_event.precision`
(default `precise`). On create it **defaults from `source`** — `photo`/`voice` → `rough`, everything else
→ `precise` — and an explicit `precision` on the request wins. The recognition confirm card gains a
**Light / Medium / Large** portion picker that scales the recognized quantity (×0.7 / ×1 / ×1.4) from the
recognized base. The Overview timeline marks rough events with a `~`. **Deferred:** the confidence-aware
**ranges in totals** ("protein 145–165 g") — that's a separate analytics change to `dailyTotals` + the
totals UI, tracked as a follow-up.
**Consequences:** estimates are now flagged at the source and visible, and portioning a photo meal is two
taps; the data is in place for range-based totals later. Additive migration with a default, so no backfill.
Trade-offs: the rough/precise split is binary (no per-substance uncertainty yet); portion factors are fixed
constants. Pure scaling is unit-tested; the source→precision defaulting is integration-tested; the rough tag
is browser-verified.

### ADR-031
**Title:** Soft-delete reusable items; past logs keep their frozen snapshot.
**Status:** Accepted (2026-06-18). Realizes R-CAP-29; applies the event soft-delete pattern of
[ADR-018](#adr-018) to `input_item`. No migration — `input_item.deletedAt` has existed since v2-2.
**Context:** The catalog accrues one-off, mistaken, or stale items, but an item can't be hard-deleted
without orphaning history: every past `intake_event` may reference it. We need a delete that tidies the
catalog without rewriting the timeline.
**Decision:** **Soft delete** — `DELETE /api/items/:id` sets `input_item.deleted_at` (`softDeleteItem`,
204 / 404). All catalog read paths already filter `deleted_at` (`listItems`, item search, `getItemDetail`,
`listQuickItems`, stack-member listing), so a deleted item leaves the catalog, search, and Quick Capture.
**Past logs are untouched:** each `intake_event` froze its own `display_name` + `resolved_amount` snapshot
at log time (ADR-018), so the timeline and daily totals render with no dependency on the live item.
Resolution that loads an item by id (the resolve graph, used for *re-resolving an edited event* or a stack
that still lists it as a member) intentionally does **not** filter `deleted_at`, so those keep working. The
UI is a two-step confirm in the Add Item item popup.
**Consequences:** the catalog stays clean while history is preserved and analysable; delete is reversible in
principle (the row and its components remain). Trade-offs: rows are never reclaimed (fine at single-user
scale); there's no "show deleted / undelete" UI yet (the data supports adding one); a soft-deleted item can
still be referenced by *new* logs if something holds a stale id, but no UI surfaces deleted items to do so.

### ADR-030
**Title:** Stack is a first-class item kind, with a single-vs-individual capture choice and Overview expansion.
**Status:** Accepted (2026-06-17). Phase **v2-C2.1**; refines [ADR-029](#adr-029) (whose whole-vs-per-member
logging mechanism is kept). Realizes the extended R-CAP-23.
**Context:** ADR-029 modelled a stack as a `recipe`, which overloaded "recipe" (a food made of
ingredients) with "a routine of items" and gave no clean signal for stack-specific behaviour. The owner also
wants to **choose at capture** whether a stack is stored as one combined entry or as separate item entries,
and to **see the member items** of a combined entry in the Overview.
**Decision:**
- **Kind:** add `stack` to the `input_kind` enum (migration `0006`, additive `ADD VALUE`). A stack is a
  `stack`-kind item whose components are child items; the item editor offers **separate Create item / Create stack forms** (an `ItemDraftForm` `mode`; the
  stack form has only members and excludes other stacks), and Quick Capture member loading keys off `kind = 'stack'` (not `recipe`). Recipes go back to meaning
  food-from-ingredients.
- **Capture choice (`stackLogPlan(item, included, mode)`):** tapping a stack card logs it as a **single
  entry** (one `intake_event` against the stack — the default); an **"Log as separate items"** action in the
  expanded card logs **one event per included member**; the skip checklist drives `included`. Single is only
  representable when all members are included (a partial selection always logs per-member, since we don't
  recompute a reduced frozen snapshot).
- **Overview:** the event read DTO carries `stackItems` — the member items of a stack logged as a single
  entry (a join in `listIntakeEvents`/`getIntakeEvent`); the timeline lists them under a "stack" tag so a
  one-entry log still shows what it contained.
**Consequences:** "stack" is now explicit and self-documenting; the user controls the entry shape; a combined
stack entry stays a single clean timeline row that expands to its items, while separate mode gives
first-class per-item rows. Totals are identical across modes (the resolver expands the stack either way).
Trade-offs: stacks created under ADR-029 as `recipe` items aren't auto-migrated to `stack` (the owner
recreates them — little/no stack data existed yet); a partial single-entry stack still isn't representable
(per-member by design). Pure `stackLogPlan` (single/separate/skip) + `draftToBody` mapping are unit-tested;
`quick-items` members and event `stackItems` are integration-tested; build → log-single → log-separate →
Overview-expansion is browser-verified.

### ADR-029
**Title:** Stacks = recipe favorites; log the whole stack as one event, a partial stack per included member.
**Status:** Accepted (2026-06-17). Phase **v2-C2** of the Capture Seamlessness track; builds on Quick
Capture ([ADR-027](#adr-027)). Realizes R-CAP-23. No migration — reuses the existing `item_component`
child-item support. **Stack modelling refined by [ADR-030](#adr-030)** — a stack became its own item
`kind` (not a `recipe`), capture gained an explicit single-vs-separate choice, and a single stack entry is
expanded to its members in the Overview. The whole-vs-per-member logging mechanism below still stands.
**Context:** A "Morning Stack" (take several supplements together) needs one-tap logging *and* a way to skip
an item on a given day. The data model already represents a multi-item routine as a **recipe** item whose
components are `childItemId`s, and the resolver already expands a recipe into all its members' substances —
but (a) the item editor couldn't build one (components were substance-only) and (b) logging a recipe was
all-or-nothing.
**Decision:** A **stack is a `recipe` item whose components are child items.** Two parts:
- **Build:** the item editor (`ItemDraftForm`) gains a *Stack members* section for `recipe` kind — pick
  existing items by name (catalog datalist → resolved to `childItemId`), each with a qty/unit; `draftToBody`
  emits child-item components. A *Create manually* entry on Add Item opens a blank editor (previously the
  editor only appeared after a scan/barcode).
- **Log (Quick Capture):** `quick-items` now returns a stack favorite's members. Tapping it logs by a
  rule (`stackLogPlan`): **every member included → one `intake_event` against the recipe item** (a single
  "Morning Stack" timeline entry that the resolver expands); **any member skipped → one event per included
  member** (so the omitted ones simply aren't logged). An expandable checklist (all checked by default)
  drives the inclusion set; Undo deletes every event the tap created.
Medication "exact-dose one-tap" needs no new code — pin the med (its serving = the dose) with optional dose
presets (C1); there is no rough mode for it to fall into.
**Consequences:** one tap takes the whole routine with a clean single timeline entry, yet skipping is
trivial; totals are identical either way (the resolver expands the recipe, or each member resolves itself).
Trade-offs: a partial log produces N separate timeline entries rather than one grouped "Morning Stack minus
X" entry (we don't recompute a reduced frozen snapshot — that would fight the per-event snapshot model);
stack members are picked by exact name match in the editor (no fuzzy search there yet). Pure `stackLogPlan`
+ `draftToBody` member mapping are unit-tested; the quick-items members query is integration-tested; build →
pin → log-all → skip-one is browser-verified.

### ADR-028
**Title:** Capture provenance + "log it often → suggest pinning" (Quick Capture foundations).
**Status:** Accepted (2026-06-17). Phase **v2-C0** of the Capture Seamlessness track; foundations under
[ADR-027](#adr-027). Realizes R-CAP-12 (properly) and R-CAP-28.
**Context:** R-CAP-12 asked every event to record its **provenance**, but the v2 `intake_event` had no
`source` column — so the requirement was only nominally met. We also want frequent items to *graduate* into
one-tap favorites instead of relying on the owner to remember to pin them.
**Decision:** (1) **Provenance** — add an `intake_source` enum (`quick`, `recent`, `photo`, `voice`,
`manual`, `api`) and a non-null `intake_event.source` column (default `manual`, so historical rows and bare
posts are valid). Every capture path stamps it: Quick Capture → `quick`, recent-chip re-log → `recent`,
meal photo → `photo`, spoken/typed phrase → `voice`; a direct API ingest is `api`. It rides on the existing
`POST /api/intake` body (optional, validated) and is returned on reads. (2) **Suggestions** — a pure-SQL
`favoriteSuggestions` (items with ≥3 logs in the last 30 days, not already pinned, by count) behind
`GET /api/intake/favorite-suggestions`; the Quick Capture screen shows them with a one-tap **Pin**
(`PATCH …/quick-log`). **Precision (rough/precise) and confidence-aware ranges are deliberately deferred to
v2-C4**, where photo-portion sizing makes them useful.
**Consequences:** provenance is now real and queryable (enables "does logging by photo correlate with…",
and powers future suggestions/analysis); favorites curate themselves over time. Additive migration with a
default, so no backfill. Trade-offs: the `source` taxonomy is coarse (one enum, not a full event-history);
suggestion thresholds (3 logs / 30 days) are constants for now. Pure payload logic + the suggestion query
are tested (route test: log ×3 → suggested → pin → drops off); the suggest→pin and per-source logging are
browser-verified across all capture paths.

### ADR-027
**Title:** Quick Capture — a capture-first screen of one-tap favorites, beside the existing Log screen.
**Status:** Accepted (2026-06-17). First step of the **Capture Seamlessness** track (R-CAP-22; phases
v2-C1…C6). Builds on the existing two-layer model (human `intake_event` → background resolution) and reuses
the item catalog + `POST /api/intake`.
**Context:** The capture philosophy is "log in 1–3 seconds now, add precision later." The existing Log
screen (ADR-020) leads with photo/voice/recognition and lists *recent* items; it doesn't offer a curated,
capture-first home of the handful of things logged daily (water, coffee, supplements, usual meals). We want
that one-tap home without disturbing the working Log screen, and to migrate gradually.
**Decision:** Add a **new `/capture` screen** rather than rebuilding Log, so both run side-by-side for
comparison (Log is removed later once Quick Capture covers its uses). An item gains `quick_log` (pinned) +
`quick_order`, and an optional small set of **amount presets** in a typed `quick_preset` table
(`label, quantity, unit`) — e.g. Water 250/500/750 ml. New routes: `GET /api/intake/quick-items` (favorites
+ presets, ordered) and `PATCH /api/items/:id/quick-log` (pin/unpin + replace presets); favorites are
curated from the Add Item item popup. Tapping a favorite logs an **ordinary `intake_event`** against the
item at its default serving (or a chosen preset amount) with an **Undo** (soft-delete), so the
resolver/totals/snapshots are unchanged — Quick Capture is pure capture UX over the existing model. Presets
live in their own table (not jsonb) to keep the typed-model convention (§4b).
**Consequences:** the everyday logs become one tap with no new analytical machinery; the legacy Log screen
keeps working during the transition (nav has both). Trade-offs: a fifth nav tab until Log is retired;
favorites are curated by hand for now (auto-suggesting them is a later phase, R-CAP-26); a "skip part of a
stack" / modifiers / portion-ranges are explicitly deferred to v2-C2…C4. Pure payload logic is unit-tested;
the routes are integration-tested (pin → list → unpin); the pin→log→undo flow is browser-verified.

### ADR-026
**Title:** Scan the barcode from a still photo, not a live video stream.
**Status:** Accepted (2026-06-17). Supersedes the capture mode in [ADR-025](#adr-025) (keeping its ZXing
decoder + format hints); the server seam/route/mapping in [ADR-024](#adr-024) are unchanged.
**Context:** [ADR-025](#adr-025) decoded a **live** camera stream
(`BrowserMultiFormatReader.decodeFromConstraints`). On the phone it opened the camera but wouldn't lock onto
the barcode: live preview frames are low-resolution and frequently out of focus, which ZXing can't read. A
**still photo** taken by the native camera is full-resolution and autofocused, so it decodes far more
reliably — and the owner already preferred "just take a picture" (the same reason Add Item is photo-first).
**Decision:** Replace the live scanner with a **photo capture**. "📷 Scan barcode (take a photo)" is a
`<label class="primary">` wrapping a hidden `<input type="file" accept="image/*" capture="environment">`, so
tapping it opens the OS camera. On `change`, the still is decoded with
`reader.decodeFromImageUrl(objectURL)` (ZXing, same EAN-13/8 + UPC-A/E hints, plus `TRY_HARDER`); a hit
flows into the existing Open Food Facts lookup → editable draft → **Save**, a miss shows a "retake up close,
filling the frame" message. ZXing is still **dynamically imported** on first use. This drops all live-stream
machinery (`getUserMedia`, the `<video>`, the per-frame loop, scanner-stop on destroy), so the code is
simpler with no camera-stream lifecycle to manage.
**Consequences:** scanning is reliable on the phone (a sharp, autofocused still vs. a shaky low-res frame),
and the implementation is smaller. Trade-off: a couple extra taps per scan (open camera → shoot → use photo)
versus point-and-it-reads — acceptable, and the only thing that actually works on the device. Verified
end-to-end here by generating a real EAN-13 barcode image (Nutella `3017620422003`), feeding it to the photo
input, and confirming it decodes → looks up → fills the draft; the not-found path shows the retake message.

### ADR-025
**Title:** Decode barcodes with ZXing (in-JS), not the native `BarcodeDetector`.
**Status:** Accepted (2026-06-17). Supersedes the client-decoder choice in [ADR-024](#adr-024); the server
seam/route/mapping there are unchanged.
**Capture mode (live video) superseded by [ADR-026](#adr-026)** — live-video decode struggled to lock on
(low-res, unfocused frames on the phone); the barcode is now read from a still photo. The ZXing choice and
format hints below still stand; only `decodeFromConstraints` (live) → `decodeFromImageUrl` (still) changed.
**Context:** ADR-024 read the barcode from the camera with the native **`BarcodeDetector`** API. On the
owner's iPhone (Chrome) it reported "barcode scanning isn't supported" — because **all iOS browsers are
WebKit under the hood, and WebKit doesn't implement `BarcodeDetector`**. With no manual-entry fallback (a
deliberate camera-only choice), that left the barcode path completely unusable on the primary device.
**Decision:** Decode in JavaScript with **ZXing** (`@zxing/browser` + `@zxing/library`), which runs the
same on iOS WebKit, Android Chrome, and desktop. On the Add Item screen, "📷 Scan barcode with camera"
calls `BrowserMultiFormatReader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, cb)`
with the format hints restricted to **EAN-13/8 + UPC-A/E**; the first decoded value stops the scanner
(`controls.stop()`, which also releases the camera stream) and flows into the existing barcode lookup. ZXing
is **dynamically imported** only when scanning starts (it's a heavy dep, and the app sets `ssr = false`), so
it code-splits out of the initial bundle. Camera-permission denial surfaces a clear message; the scanner is
also stopped on component destroy. Still camera-only (no manual entry), per [ADR-024](#adr-024).
**Consequences:** barcode capture now works on iPhone/iOS (the actual target device) and everywhere a secure
context can open the camera; one path to maintain across platforms instead of a native-vs-fallback split.
Trade-offs: ZXing adds ~a few-hundred-KB lazy chunk (loaded only on first scan) and decodes in JS rather
than native, so it's a touch slower than `BarcodeDetector` would be on Android — acceptable for occasional
scanning. Requires a secure context (HTTPS / localhost) for `getUserMedia`, which the deploy already is. The
camera-decode path can't be exercised headlessly; it's verified by confirming the scan path loads ZXing and
requests the rear camera, plus device testing for a live decode.

### ADR-024
**Title:** Add Item by barcode — look products up against Open Food Facts behind a key-less seam.
**Status:** Accepted (2026-06-17). Realizes R-CAP-21; reuses the SDK/seam + pure-parser pattern of
[ADR-019](#adr-019) and feeds the same draft-item editor and `POST /api/items` save path.
**Client decoder superseded by [ADR-025](#adr-025)** — `BarcodeDetector` doesn't exist on iOS WebKit (so it
failed on iPhone, where every browser is WebKit); the camera decode now uses ZXing. The server seam, route,
mapping, and editor flow below are unchanged.
**Context:** Most packaged foods/drinks carry a barcode, and their nutrition is already in the open
[Open Food Facts](https://world.openfoodfacts.org) database. Typing or photographing the facts panel
(ADR-019) is avoidable for these: scanning the barcode is faster and less error-prone, and — unlike the
Claude-vision scan — needs **no API key**, so it works on a bare deploy.
**Decision:** A new **`ProductLookup`** seam ([`server/barcode.ts`](../server/barcode.ts)) with a pure
`parseOffProduct(raw, barcode)` that maps an Open Food Facts product into an editable `CreateItem` (the same
draft the label scan returns), unit-tested with no network. The concrete **`OpenFoodFactsLookup`**
([`server/barcode_off.ts`](../server/barcode_off.ts)) fetches `GET /api/v2/product/{barcode}` (a `fetch` is
injected so tests stub the network) and returns `null` on a 404 (unknown barcode). Route **`POST
/api/items/barcode`** validates an 8–14-digit barcode (Zod, [`shared/inputs.ts`](../shared/inputs.ts)),
returns the draft, `404` when not found, `502` on upstream failure, `503` if the seam is absent. Because it
needs no key, **`main.ts` always wires it** (the Claude seams stay key-gated). Mapping: macros that Open
Food Facts stores reliably — calories (kcal), protein, carbohydrate, sugar, fat, sodium (g; the resolver
converts to mg) — preferring per-serving figures, else per-100 g; the product's `serving_quantity` becomes
the item's **canonical gram serving** (ADR-019/R-CAP-17) when known; beverages (by category) map to
`drink`. On the client the Add Item screen reads the barcode live from the rear camera with
**`BarcodeDetector`** (no manual-entry box — the owner always photographs the product), then the existing
draft-edit + **Save** flow persists it.
**Consequences:** barcode capture works with no secret and no model cost; the pure parser is unit-tested and
the route integration-tested with a stub lookup (no DB), the live lookup is checked against real barcodes,
and the type→lookup→edit→save flow is browser-verified. Trade-offs: coverage and data quality ride on Open
Food Facts (crowd-sourced; some products missing or sparse); vitamins/minerals are deliberately **not**
mapped (their units there are inconsistent and would risk wrong frozen snapshots); the live camera scan
depends on `BarcodeDetector` (Chromium/Android today) — with no manual-entry fallback, the barcode path is
unavailable where it's unsupported (e.g. iOS/Safari), where the label-photo scan (ADR-019) still covers Add
Item; an outbound call to a third party is introduced (no PII sent — just the barcode).

### ADR-023
**Title:** "Ask LLM" — answer free-form/preset questions over the last 48h of logs, with the prompt built server-side.
**Status:** Accepted (2026-06-16). Realizes the MVP's real-time questions (R-RT-1..6) on the v2 typed
entities and is the first cut of phase **v2-A** (cross-domain analysis); reuses the SDK-isolated seam
pattern of ADR-019/020.
**Context:** The point of logging inputs + feelings is to ask "why is my energy low?", "what can I do?",
"anything I should be careful with?" — and arbitrary follow-ups. We want one screen that reasons over the
recent log, keeping the Anthropic key and prompt construction server-side, and not requiring the client to
ship data.
**Decision:** A new **Ask LLM** screen (`/ask`) offers three preset questions and a free-text box (typed,
or dictated with the OS keyboard mic — same on-device voice approach as ADR-021, so no new key/route). It
calls **`POST /api/ask`** with just `{ question }`. The route gathers the **last 48 hours** server-side —
check-ins, intake events (with resolved substances), and per-substance totals — and hands them to an
**`Advisor`** seam ([`server/advise.ts`](../server/advise.ts)). A pure `buildAdvicePrompt`/`summarizeContext`
turns the context + question into a system+user prompt (unit-tested, SDK-free); the concrete
**`AnthropicAdvisor`** ([`server/advise_anthropic.ts`](../server/advise_anthropic.ts)) calls Claude
(`CLAUDE_MODEL`, `max_tokens` 1024) and returns the answer text; the client renders it as **Markdown,
sanitized** (`marked` + `DOMPurify`, [`web/src/lib/markdown.ts`](../web/src/lib/markdown.ts)) since the
answer is model-generated. The system prompt scopes
the model to the provided data, asks for concise actionable suggestions citing the logged items/times, and
frames it as **general wellness reflection, not medical advice**. The route is optional: `503` when
`ANTHROPIC_API_KEY` is unset (the UI shows a friendly message); the 48h window is a constant
(`ADVICE_WINDOW_HOURS`). The route lives in `app.ts` (cross-domain: subjective + inputs).
**Consequences:** the existing prod Anthropic key (already used by scan/recognize) powers this too — **no
new secret**. Server-side gathering keeps the client thin and the prompt one place to tune. Trade-offs: a
fixed 48h window (not user-selectable yet) and a single-turn Q&A (no conversation memory); answer quality
rides on the model and on how much has been logged; the summary is plain text, not the full correlation
analysis envisioned for v2-A (this is the first cut). Pure prompt building is unit-tested; the route is
integration-tested with a mock advisor (gathers the right window); the screen + 503 fallback are
browser-verified; live answers are device-verified.

### ADR-022
**Title:** Fuzzy item search with pg_trgm — match a recognized name to a stored item despite punctuation, word order, and mishears.
**Status:** Accepted (2026-06-16). Refines the catalog-match step of [ADR-020](#adr-020)/[ADR-021](#adr-021)
from owner feedback; affects `listItems` ([`db/inputs.ts`](../db/inputs.ts)) and adds a migration.
**Context:** The catalog search (used by both the recognize auto-match and the confirm-card search box, R-CAP-18)
was a strict `ILIKE '%query%'` on `input_item.name`. Voice/photo recognition rarely reproduces a stored name
exactly — "pre workout" never substring-matches **"Dope-Max Pre-Workout"** because of the hyphen (yet "pre" and
"workout" each do), and word-order or minor mishears miss too — so the user couldn't find items they'd already
saved.
**Decision:** Enable the Postgres **`pg_trgm`** extension and search by **trigram word-similarity** instead.
`listItems(search)` now matches rows where `word_similarity(query, name) > 0.3` **or** the name still contains
the query as a substring (belt-and-suspenders for very short queries), ordered by `word_similarity(...) DESC`
so the best match is first. A GIN trigram index (`input_item using gin (name gin_trgm_ops)`) is added — it
also accelerates the `ILIKE` fallback. Migration `0003_item_search_trgm.sql`. The threshold (`0.3`) is lenient
to favour recall in a tool where the user confirms the choice; `word_similarity` (not plain `similarity`)
handles a short query against a longer name (e.g. "magnesium" → "Magnesium Glycinate").
**Operational note:** migrations are applied manually (`deno task migrate`, ADR-011) — this one must be run
against the deployed database so `pg_trgm` exists before the new query ships.
**Consequences:** recognized/typed names reliably surface their stored item across punctuation, case,
word-order, and small spelling differences ("yoghurt" → "Greek Yogurt"), ranked best-first. Trade-offs: a new
(standard, Supabase-available) extension dependency; the lenient threshold can surface loosely-related items
low in the list (acceptable — the user picks, and "save as new" is always present); `pg_trgm` must exist in CI
Postgres (the migration's `create extension if not exists` handles it). Verified by an integration test
("pre workout" and "dope max pre workout" → "Dope-Max Pre-Workout"; partials and a misspelling match; an
unrelated query does not).

### ADR-021
**Title:** Refine Log capture — camera-or-upload photo, OS keyboard dictation for voice, live catalog search in the confirm card.
**Status:** Accepted (2026-06-15). Refines [ADR-020](#adr-020) (which it partially supersedes) from owner
feedback after the first cut shipped; same Inputs model and recognizer seam.
**Context:** Three issues surfaced in real phone use of the ADR-020 Log screen. (1) The photo input used
`capture="environment"`, so phones jumped straight to the camera with no way to pick an existing photo from
the album. (2) Voice used the Web Speech API; the owner prefers the phone's **own** dictation — the 🎤 on
the system keyboard they already trust — over a browser engine. (3) Recognition's catalog match was a single
server-side `ilike` on the recognized name, so when it returned nothing the user had no way to find and
attach an existing item; they want to search the database and choose a stored item or save as new.
**Decision:** (1) **Photo** splits into two file inputs — **Camera** (`capture="environment"`) and **Upload**
(no `capture`, so the OS offers album/files) — both feeding the same recognizer. (2) **Voice** drops the Web
Speech API entirely; the "Speak / type" mode opens a text field and focuses it within the tap gesture so the
system keyboard appears, and the user taps its dictation mic (or types). The phrase is sent to
`POST /api/intake/recognize` as text exactly as before — so we lean on the OS's transcription, mirroring v1,
with Anthropic still the only key. (3) The confirm card gains a **live catalog search** box (seeded with the
recognized/recent name, debounced `GET /api/items?search=`); results render as selectable "Log <item>"
options alongside **Save as a new item** (when a recognized draft exists) and **Just log the name**. The
target is tracked by a string key (`item:<id>` / `new` / `freeform`) so the option list can change as the
user searches. (4) The intake **unit** becomes a dropdown of common display units ([`web/src/lib/units.ts`](../web/src/lib/units.ts)),
keeping any off-list value (e.g. a recognizer's odd unit) selectable.
**Consequences:** capture matches how phones actually work (album or camera), voice uses the dictation the
user knows (and degrades to plain typing where dictation is unavailable — no browser-support caveat), and an
intake can always be reconciled to an existing item by searching, not just by a lucky name match. Trade-offs:
voice no longer auto-submits on end-of-speech (the user taps Continue), which is an extra tap but avoids
false captures; the display-unit list is curated, not exhaustive (off-list values still work). The Web Speech
client code (`webkitSpeechRecognition`) is removed; no server route changes. Camera/upload split, the
dictation field, live search, and the unit dropdown are browser-verified; live photo/voice remain
device-verified.

### ADR-020
**Title:** Log intake by photo, voice, or a recent item — recognize → match → quick-confirm; drop the manual form.
**Status:** Accepted (2026-06-15). Builds on the Inputs domain (R-DOM-4, [ADR-018](#adr-018)) and the
recognizer seam pattern of [ADR-019](#adr-019); realizes R-CAP-16/18/19. **Partially superseded by
[ADR-021](#adr-021)** (2026-06-15): the photo mode gains an explicit upload-vs-camera choice, voice moves
from the Web Speech API to the OS keyboard's own dictation, and catalog matching becomes a live search in
the confirm card. The seam architecture, recognizer, and recent-items design below are unchanged.
**Context:** Hand-typing every intake (name, search, amount, unit, time, tags) is the highest-friction
part of daily capture and depresses logging. Most logs are either a meal/drink in front of the user, a
quick spoken note, or a repeat of something logged before. We want those three to be near-instant while
still producing the analytical decomposition the Inputs model needs — and without a manual fallback form
re-growing the friction.
**Decision:** The Log screen offers exactly three capture modes; the freeform manual form is removed.
(1) **Photo** — a meal/drink photo is base64'd client-side and sent to `POST /api/intake/recognize`.
(2) **Voice** — transcribed **on-device** by the browser's **Web Speech API** (vendor-prefixed
`webkitSpeechRecognition`); the resulting transcript is sent to the same recognize route as text. No audio
leaves the device and no transcription provider/secret is needed — this mirrors v1's model (Apple/OS
dictation → text → Claude extracts), since the Anthropic API has no audio input. (3) **Recent** —
`GET /api/intake/recent-items` returns the top-N distinct recently-logged items (deduped by `itemId`, or by
display name for freeform logs) for one-tap re-logging. One new SDK-isolated seam mirrors `ItemScanner`: an
**`IntakeRecognizer`** ([`server/recognize.ts`](../server/recognize.ts), Claude vision for a photo / text
for a phrase) returns a recognized `{name, quantity, unit}` **and** a full draft item carrying estimated
nutrients. The recognize route also **matches the catalog** (the existing `ilike` item search on the
recognized name). The client shows a **quick-confirm** (editable name/quantity/unit/time) where the user
picks one target: an existing matched item, **save as a new item** (persist the recognized draft via
`POST /api/items`, auto-creating unknown substances per ADR-019) then log, or log by name with no breakdown
— all converging on `POST /api/intake`. Recognition is optional: the route returns `503` when no Anthropic
key is set, and the UI surfaces a friendly message (recent-item logging and on-device voice transcription
need no server key). Pure parsing (`parseRecognized`) is kept SDK-free and unit-tested.
**Consequences:** three-tap (or one-tap) capture that still yields resolved substances, with **Anthropic as
the only API key**; the catalog and substance vocabulary keep growing from real logs. Trade-offs: Web Speech
support and accuracy vary by browser (good on Chrome and Safari incl. iOS; absent on Firefox — the UI says
so and offers photo/recent); recognition quality/cost ride on the chosen model and are device-verified (key
lives only in Deno Deploy env); catalog matching is substring, not semantic, so near-misses may show as
"save as new"; meal photos become a single `simple` item with estimated nutrient components rather than
itemized per-food events (the MVP's meal-picker UX from R-CAP-16 is not carried over). Recent→confirm→log
and the recognition 503 fallback are browser-verified; live photo/voice are device-verified.

### ADR-019
**Title:** Add items by photographing the label — Claude vision drafts an editable item; unknown actives auto-create substances.
**Status:** Accepted (2026-06-15). Builds on the Inputs domain (R-DOM-4, [ADR-018](#adr-018)); realizes
R-CAP-17. Re-homes the MVP's photo-food idea ([ADR-013](#adr-013)) onto the typed Inputs model.
**Context:** Hand-entering a supplement's full active list (a dozen substances, amounts, units) is the
slowest, most error-prone part of capture. The label already has the data. We want phone-camera capture
that reads the whole ingredients panel, but the model can misread, and a scanned active may not be in
the seeded `substance` vocabulary — so the result must be correctable and a save must never be blocked
by an unknown name.
**Decision:** The `/manage` "Add Item" screen takes/uploads a label photo, base64-encodes it client-side,
and `POST`s it to **`/api/items/scan`**. A server-side **`ItemScanner`** ([`server/scan.ts`](../server/scan.ts))
abstracts the model; the concrete **`AnthropicItemScanner`** ([`server/scan_anthropic.ts`](../server/scan_anthropic.ts))
sends the image to Claude vision (`@anthropic-ai/sdk`, model `CLAUDE_MODEL`, default `claude-haiku-4-5`)
and a tolerant pure parser (`extractJson` + `parseScannedItem`) returns a `CreateItem` **draft** — never
persisting anything. The screen renders the draft as **editable fields** (name, kind, type, serving,
one row per ingredient) for the user to correct, then **Save** calls the existing `POST /api/items`.
On save, **unrecognized actives auto-create a `substance`** (`db/inputs.ts` `resolveSubstanceId`): the
name is normalized (lowercase, `[\s-]+`→`_`, so "Vitamin D" matches the seed `vitamin_d`), the unit is
coerced to a canonical `SUBSTANCE_UNIT` (µg/ug→mcg, else mg), and a `type: "other"` substance is inserted
`onConflictDoNothing` then re-selected — so the whole label is captured and rolls into totals going
forward. Scanning is **optional**: `/api/items/scan` returns `503` when `ANTHROPIC_API_KEY` is unset, and
the UI falls back to an empty editable draft for manual entry, so capture works with no model configured.
The SDK is isolated in `scan_anthropic.ts`, keeping the parser (`scan.ts`) SDK-free and unit-testable.
**Consequences:** near-zero-friction capture of complex labels with a human correction step before
persistence; the analytical vocabulary grows automatically instead of dropping unknown actives. Trade-offs:
auto-created substances carry a coerced unit and `type: "other"` (no elemental classification — curation
deferred); normalization reduces but cannot fully prevent near-duplicate substances (e.g. synonyms);
vision quality/cost ride on the chosen model; live scan accuracy is device-verified (the key lives only
in Deno Deploy env). The scan→draft→edit→save flow and auto-create are browser-verified; the manual
fallback works offline of the model.

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
stable when items are later edited. The event keeps only its display quantity; the canonical amounts
and their `confidence` live on `resolved_amount`. Freeform logs (no item, optional manual substance
amounts) are allowed for fast/rough capture and later refinement.
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
