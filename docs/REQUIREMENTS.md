# TrackEverything — Requirements

> **Status:** Living document. See [Maintenance](#maintenance) for how this stays current.
> **Last updated:** 2026-06-13 (Phase 9 approved → R-PAT-2/R-VIEW-1 Built; added R-VIEW-4; UI slices 11a–11d planned)
> **Owner:** aerohit
> **Companion doc:** [ARCHITECTURE.md](ARCHITECTURE.md)

Each requirement has a stable ID (`R-<area>-<n>`) so it can be referenced from
the architecture doc, commits, and the changelog. Don't renumber existing IDs;
retire them with status `Removed` instead.

| Status | Meaning |
|---|---|
| `Proposed` | Agreed in principle, not yet designed |
| `Designed` | Reflected in ARCHITECTURE.md |
| `Built` | Implemented and working |
| `Removed` | No longer in scope (kept for history) |

---

## 1. Vision

A single place to capture everything in daily life that affects **mood, energy,
and focus** — nutrition, hydration, sleep, supplements, breathwork, workouts,
stressors — and then analyze it to find patterns and take corrective action.

The product succeeds only if **capture is nearly frictionless** and the
**analysis produces insight the user would not have reached unaided**.

## 2. Scope & users

| ID | Requirement | Status |
|---|---|---|
| R-SCOPE-1 | Single user (the owner). No multi-tenant, sharing, or onboarding flows required. | Proposed |
| R-SCOPE-2 | Architecture should not actively preclude opening to other users later, but no work is spent on it now. | Proposed |
| R-SCOPE-3 | Personal items and baselines (e.g. "my coffee", "my stack") may be hardcoded/personalized. | Proposed |

## 3. Capture

| ID | Requirement | Status |
|---|---|---|
| R-CAP-1 | One unified place captures all categories of input (no per-tracker silos). | Built |
| R-CAP-2 | Support **voice** capture: speak freely, system extracts structured records. | Built |
| R-CAP-3 | Support **manual** entry as an alternative to voice. | Built |
| R-CAP-4 | Support **device/integration** capture (see §4). | Proposed |
| R-CAP-5 | **Quick-log templates** for repeated habits (coffee, protein shake) — one tap/utterance logs a pre-defined event with sensible defaults. | Built |
| R-CAP-6 | Quick-log is reachable with minimal friction (Lock/Home screen, Siri, later a watch complication). | Built |
| R-CAP-7 | **Dual timestamps** on every event: `occurred_at` (when it happened) and `recorded_at` (when it was logged). After-the-fact entry must preserve this distinction. | Built |
| R-CAP-8 | Voice/LLM resolves relative time references ("at 10am", "an hour ago", "this morning") into `occurred_at`. | Built |
| R-CAP-9 | Before saving extracted records, show a **confirmation card** with one-tap edit. Errors must be cheap to correct. | Built |
| R-CAP-10 | A single utterance may produce **multiple events** ("coffee and my magnesium" → 2 records). | Built |
| R-CAP-11 | Capture works **offline**; records sync when connectivity returns. | Proposed |
| R-CAP-12 | Each event records its **source/provenance** (voice, manual, Whoop, …) and a confidence/uncertainty flag for inferred fields (esp. inferred times). | Built |
| R-CAP-13 | Log a multi-ingredient supplement (e.g. sleep stack, pre-workout) by its **product name alone**, as a single quick entry — without re-entering ingredients each time. | Built |
| R-CAP-14 | Define a supplement **product's ingredient list once** (per ingredient: name, amount, unit); it is reused for every log of that product. Support a servings/dose multiplier per log. | Built |
| R-CAP-15 | Populate a product's ingredient list by **uploading a photo** of the supplement-facts / ingredients label; the system extracts the structured ingredient list for confirmation/edit (image capture modality). | Built |

## 4. Data sources & integrations

| ID | Requirement | Status |
|---|---|---|
| R-SRC-1 | **Whoop** integration for sleep and workout intensity (recovery, strain, detailed sleep). | Proposed |
| R-SRC-2 | **Manual / voice** is a first-class source and the system is fully usable with no wearable. | Proposed |
| R-SRC-3 | Integrations are **pluggable** — new sources (Apple Watch/HealthKit, Oura, …) can be added later without reworking the core. | Proposed |
| R-SRC-4 | Ingested device data lands in the same unified event log as manual/voice entries. | Proposed |

## 5. Subjective check-ins (mood / energy / focus)

| ID | Requirement | Status |
|---|---|---|
| R-SUBJ-1 | Capture subjective **mood, energy, focus** on a simple scale (e.g. 1–5). These are the outcome variables for analysis. | Built |
| R-SUBJ-2 | **Scheduled prompts** nudge for a quick check-in at configured times of day. | Built |
| R-SUBJ-3 | **On-demand** check-in: log a state any time, especially when something shifts (anxious, foggy, great). | Built |
| R-SUBJ-4 | (Optional) Offer to attach a quick rating right after logging an event, to strengthen cause→effect links. | Proposed |

## 6. Real-time analysis

Operates over the recent timeline (last 24–48h) and answers questions in the moment.

| ID | Requirement | Status |
|---|---|---|
| R-RT-1 | "**Why** am I feeling X right now?" — diagnose current anxiety/low mood against recent inputs. | Built |
| R-RT-2 | "**What can I do right now** to fix it?" — actionable suggestions (breathwork, food, walk, stop caffeine). | Built |
| R-RT-3 | "**What's dragging me down?**" — attribute current low energy/focus/mood to recent inputs. | Built |
| R-RT-4 | "**Should I do X right now?**" — decision support (another coffee? work out given recovery?). | Built |
| R-RT-5 | "**How will I feel later?**" — forward-looking prediction given today's inputs so far. | Built |
| R-RT-6 | Real-time answers cite the specific events/data they reasoned from. | Built |

## 7. Retrospective analysis (pattern finding)

| ID | Requirement | Status |
|---|---|---|
| R-PAT-1 | Link low energy/mood/focus back to nutrition, sleep, workouts, supplements, stressors, etc. | Proposed |
| R-PAT-2 | Compute **daily aggregates** (e.g. total caffeine, last-caffeine time, sleep hours, workout load) and outcome metrics. | Built |
| R-PAT-3 | Run **correlation / lagged analysis** between inputs and outcomes (including next-day effects). | Proposed |
| R-PAT-4 | Have the LLM **interpret** the statistical findings into plain-language insights and suggested experiments. | Proposed |
| R-PAT-5 | Analyze supplement intake at **two granularities**: whole-product and decomposed into ingredients (e.g. total magnesium summed across all products/foods; correlate a single ingredient such as L-theanine with outcomes). | Built |

## 8. Overviews & reporting

| ID | Requirement | Status |
|---|---|---|
| R-VIEW-1 | **Daily** overview of inputs and subjective state. | Built |
| R-VIEW-2 | **Weekly** overview with trends. | Proposed |
| R-VIEW-3 | **Monthly** overview with trends and surfaced patterns. | Proposed |
| R-VIEW-4 | **Event timeline / history** list view: scroll recent events in time order (backed by a `GET /events` list endpoint). | Proposed |

## 9. Non-functional requirements

| ID | Requirement | Status |
|---|---|---|
| R-NFR-1 | **Low-code-first**: prove the capture→store→analyze loop with minimal custom code before building a polished app. Owner has limited coding experience and will run, not author, most code. | Proposed |
| R-NFR-2 | **Cloud LLM is acceptable** for analysis (e.g. Claude API). Raw timeline data may be sent to a hosted model. | Proposed |
| R-NFR-3 | Capture latency must feel instant; analysis may take a few seconds. | Proposed |
| R-NFR-4 | Data is durable and backed up; the event log is the system of record. | Proposed |
| R-NFR-5 | LLM/API cost should be tracked and kept reasonable for a single user. | Proposed |
| R-NFR-6 | iPhone is the primary capture surface. | Built |

## 10. Testing & quality

| ID | Requirement | Status |
|---|---|---|
| R-TEST-1 | All non-trivial code has **unit tests** covering its logic (validation, time resolution, template expansion, aggregation math, correlation math). | Proposed |
| R-TEST-2 | Each endpoint and pipeline has **integration tests** exercising the real path (HTTP → DB roundtrip; adapter → event log). | Proposed |
| R-TEST-3 | LLM extraction and analysis are covered by **fixture/golden tests**: known transcripts/timelines → expected structured output or asserted properties (e.g. "answer cites event X"). | Built |
| R-TEST-4 | External services (Claude, Whoop) are **mockable** for deterministic tests; a small separate live suite exercises the real services. | Built |
| R-TEST-5 | **CI runs all tests**; a phase is not approvable while tests are red. | Built |
| R-TEST-6 | Every phase has explicit **acceptance criteria** the owner verifies before the next phase begins (see [ROADMAP.md](ROADMAP.md)). | Proposed |

## 11. Delivery process

| ID | Requirement | Status |
|---|---|---|
| R-PROC-1 | Work is delivered in **small, independently testable phases**; each ends in an **owner approval gate** before the next starts. | Proposed |
| R-PROC-2 | The phase plan is maintained in [ROADMAP.md](ROADMAP.md) and kept in sync with these docs. | Proposed |

## 12. Open questions

Tracked here until resolved, then moved into a requirement or an ADR.

- Q1: Whoop data path — HealthKit sync vs. Whoop API directly? (leaning API for richer fields)
- Q2: ~~Exact subjective scales~~ — **Resolved (Phase 5):** 1–5 integer ratings, separate mood/energy/focus (`fields.rating`).
- Q3: Scheduled check-in cadence and times?
- Q4: Retention/units conventions (caffeine in mg, sleep in minutes, etc.) — to be fixed in the data dictionary.
- Q5: Ingredient canonicalization & unit normalization (R-CAP-14, R-PAT-5) — mapping product-listed compounds to canonical ingredients and elemental amounts (e.g. "magnesium glycinate 1000mg" → elemental magnesium), so the same ingredient aggregates across products and foods. Depth TBD; start simple (verbatim ingredient + unit) and deepen later.

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

| Date | Change |
|---|---|
| 2026-06-11 | Initial requirements captured from scoping conversation. |
| 2026-06-11 | Added Testing & quality (R-TEST-*) and Delivery process (R-PROC-*); added ROADMAP.md. |
| 2026-06-12 | Phase 0 approved → R-TEST-4/5 to Built. Added composite-supplement reqs (R-CAP-13/14/15, R-PAT-5) + open question Q5. |
| 2026-06-12 | Phase 1 approved → R-CAP-1/7/12 to Built (event-log schema). |
| 2026-06-12 | Phase 2 approved → R-CAP-3 to Built (POST /events manual capture). |
| 2026-06-12 | Phase 3 approved → R-CAP-2/8/9/10 + R-TEST-3 to Built (voice extraction). |
| 2026-06-12 | Phase 4 approved → R-CAP-5/6 to Built (quick-log templates). |
| 2026-06-12 | Phase 4b approved → R-CAP-13/14/15 + R-PAT-5 to Built (composite supplements). |
| 2026-06-12 | Phase 5: resolved Q2 (1–5 separate mood/energy/focus). |
| 2026-06-13 | Phase 5 approved → R-SUBJ-1/2/3 to Built (subjective check-ins). |
| 2026-06-13 | Phase 6 approved → R-RT-3/6 to Built (real-time /ask + citations). |
| 2026-06-13 | Phase 7 approved (PR #9 merged) → R-RT-1/2/4/5 to Built (all real-time questions). |
| 2026-06-13 | Phases 8–10 deferred; building Phase 11 (web UI) first. R-NFR-6 → Designed (PWA). See ADR-012. |
| 2026-06-13 | Phase 11 (web UI / PWA daily slice) approved (PR #11 merged) → R-NFR-6 → Built. |
| 2026-06-13 | Phase 8 still deferred; building Phase 9 (daily overview) next. |
| 2026-06-13 | Phase 9 approved (PR #12 merged) → R-PAT-2/R-VIEW-1 to Built (daily overview). |
| 2026-06-13 | Added R-VIEW-4 (event timeline/history view); planned UI completion slices 11a–11d in ROADMAP. |
