# TrackEverything — Architecture & Design Decisions

> **Status:** Living document. See [Maintenance](#maintenance) for how this stays current.
> **Last updated:** 2026-06-12 (Phase 1: event-log schema implemented — §4 points to the migration)
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
| Capture | iOS **Shortcuts** (voice + manual input) | No Xcode/App Store; Lock Screen + Siri; owner can assemble without coding | [ADR-002](#adr-002) |
| Transcription | Apple on-device dictation first; Whisper as upgrade | Free, fast, offline; LLM layer absorbs errors | [ADR-005](#adr-005) |
| Backend + DB | **Supabase** (hosted Postgres + Edge Functions) | Managed; SQL schema + functions we write, owner deploys; auth/sync included | [ADR-003](#adr-003) |
| Extraction & analysis | **Claude API** from an Edge Function | Cloud LLM acceptable (R-NFR-2); does both extraction and analysis | [ADR-004](#adr-004) |
| Overviews | Lightweight web dashboard (later in Phase 1) | Simplest way to render daily/weekly/monthly without an app | — |
| Native app | Deferred to Phase 3 | Heavy lift; only after value is proven | [ADR-001](#adr-001) |

## 4. Data model — the event log

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
- The **data dictionary** is extended with a canonical-ingredient vocabulary +
  unit normalization (open question Q5).

## 5. Source adapter layer

A thin, pluggable interface so new integrations slot in without touching the core
(R-SRC-3). Each adapter's job: pull from its source, map into event-log rows,
write them with `source` set. Whoop is the first adapter (R-SRC-1); HealthKit and
others follow the same contract. Whoop access path (HealthKit sync vs Whoop API)
is open question Q1 — leaning Whoop API for recovery/strain/detailed sleep.

## 6. Extraction pipeline (voice/manual → structured events)

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
**Status:** Accepted (2026-06-11)
**Context:** Owner has limited coding experience and wants to build collaboratively
(R-NFR-1). A native app with Whoop OAuth, widgets, and a backend is a large lift
that risks stalling before the payoff.
**Decision:** Phase 1 uses Shortcuts + Supabase + Claude; native app deferred to
Phase 3 after value is proven.
**Consequences:** Faster path to a working loop; some capture polish (widgets,
watch) waits. Architecture must avoid choices that block a later native client.

### ADR-002
**Title:** Use iOS Shortcuts as the Phase 1 capture surface.
**Status:** Accepted (2026-06-11)
**Context:** Need frictionless voice/manual capture without app development.
**Decision:** Build capture as Shortcuts that take voice/text input and POST to a
backend endpoint.
**Consequences:** No App Store/Xcode; Siri + Lock Screen ready. Limited custom UI
(e.g. rich confirmation cards) until the native app exists.

### ADR-003
**Title:** Supabase (hosted Postgres) as backend and system of record.
**Status:** Accepted (2026-06-11)
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

### ADR-010
**Title:** Model composite supplements as products with an ingredient list; analyze at both levels.
**Status:** Accepted (2026-06-12)
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
