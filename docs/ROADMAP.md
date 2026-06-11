# TrackEverything — Roadmap (phased, gated build plan)

> **Status:** Living document. **Last updated:** 2026-06-11 (Phase 0 in progress)
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

## Stage A — Foundation

### Phase 0 — Project & test harness ◐
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
  - **Local status:** `deno task test` green (7 passed, DB test skipped).
  - **Still manual (your accounts):** create the Supabase dev project; push to GitHub so
    CI runs; add `ANTHROPIC_API_KEY` to run `test:live`. See [`backend/README.md`](../backend/README.md).

### Phase 1 — Event-log schema ☐
- **Goal:** The system of record exists.
- **Build:** Migration for the `events` table (dual timestamps, `source`, JSON `fields`, confidence flag) + `templates` and `items` tables; the data dictionary (units/field names).
- **Tests:** Unit (row validation helpers); integration (insert → read an event, assert `occurred_at`/`recorded_at`, source, JSON fields survive a roundtrip).
- **You verify:** You insert a sample event via a provided script and see it stored correctly.
- **Builds:** R-CAP-1, R-CAP-7, R-CAP-12, [ADR-006](ARCHITECTURE.md#adr-006)

---

## Stage B — Capture

### Phase 2 — Manual capture (no LLM) ☐
- **Goal:** Log a structured event end to end without any AI in the path.
- **Build:** `POST /events` Edge Function (validate + store); a Shortcut with a fill-in form that calls it.
- **Tests:** Unit (validation, rejects bad payloads); integration (HTTP → DB roundtrip).
- **You verify:** Tap the Shortcut, fill fields, see the row appear.
- **Builds:** R-CAP-3, R-CAP-11

### Phase 3 — Voice → structured extraction ☐
- **Goal:** Speak freely; get clean structured records.
- **Build:** `POST /capture` (transcript → Claude structured output → candidate events, not yet saved) + confirm step that persists; known-items + taxonomy context.
- **Tests:** Unit (parse/validate Claude output; relative-time resolution with fixed "now"). Fixture/golden (sample transcripts → expected event count/categories; inferred-time flagging). Integration (transcript → candidates → confirm → stored).
- **You verify:** Speak "coffee and my magnesium at 10am," see 2 candidates with the right times, confirm, rows stored.
- **Builds:** R-CAP-2, R-CAP-8, R-CAP-9, R-CAP-10, R-TEST-3, [ADR-005](ARCHITECTURE.md#adr-005)

### Phase 4 — Quick-log templates ☐
- **Goal:** One tap to log a repeated habit.
- **Build:** Template CRUD + expansion (template + defaults → event); Shortcuts for "my coffee", "protein shake".
- **Tests:** Unit (expansion, default fields, time-aware defaults); integration (one call → correct stored event).
- **You verify:** One tap logs your coffee with the right defaults.
- **Builds:** R-CAP-5, R-CAP-6

### Phase 5 — Subjective check-ins ☐
- **Goal:** Capture mood/energy/focus, nudged and on-demand.
- **Build:** mood/energy/focus as events with `rating`; on-demand Shortcut; scheduled prompt (iOS automation/notification).
- **Tests:** Unit (rating bounds/validation); integration (check-in stored as event).
- **You verify:** Log a mood on demand; receive a scheduled nudge and complete it.
- **Builds:** R-SUBJ-1, R-SUBJ-2, R-SUBJ-3

---

## Stage C — Real-time analysis

### Phase 6 — Context assembler + first question ☐
- **Goal:** Ask one real-time question and get a grounded answer.
- **Build:** Context assembler (last 24–48h timeline + baselines); `POST /ask` with the "what's dragging me down?" template; answer cites events.
- **Tests:** Unit (window selection, timeline formatting, baseline merge); fixture (given a fixed timeline, answer references the expected events).
- **You verify:** Ask the question against real data; the answer is sensible and cites specifics.
- **Builds:** R-RT-3, R-RT-6

### Phase 7 — Remaining real-time questions ☐
- **Goal:** All five real-time questions over the same assembler.
- **Build:** Prompt templates for "why am I X", "what can I do now", "should I do X", "how will I feel later".
- **Tests:** Per-template fixture tests; integration for each route.
- **You verify:** Each question returns a useful, grounded answer.
- **Builds:** R-RT-1, R-RT-2, R-RT-4, R-RT-5

---

## Stage D — Integrations

### Phase 8 — Whoop adapter ☐
- **Goal:** Whoop sleep/recovery/strain flows into the event log.
- **Build:** Source-adapter interface; Whoop OAuth + pull job mapping payloads → events. (Resolves Q1: Whoop API vs HealthKit.)
- **Tests:** Unit (Whoop payload → events mapping, from recorded fixtures); integration (sync job writes correct events); live suite hits real Whoop.
- **You verify:** A real Whoop night appears in your timeline with correct values.
- **Builds:** R-SRC-1, R-SRC-3, R-SRC-4

---

## Stage E — Overviews & insights

### Phase 9 — Daily overview ☐
- **Goal:** See today at a glance.
- **Build:** Daily aggregation (caffeine total, last-caffeine time, sleep hours, workout load, subjective averages) + a simple daily dashboard view.
- **Tests:** Unit (aggregation math on synthetic days); integration (events → aggregates).
- **You verify:** Today's overview matches what you logged.
- **Builds:** R-PAT-2, R-VIEW-1

### Phase 10 — Weekly/monthly + correlation engine ☐
- **Goal:** Find patterns and explain them.
- **Build:** Weekly/monthly views; correlation + lagged (next-day) analysis; LLM interprets correlations into insights + suggested experiments.
- **Tests:** Unit (correlation/lag math on synthetic data with a known planted relationship); fixture (LLM turns a given correlation set into a coherent insight); integration.
- **You verify:** Weekly/monthly views are correct; an insight report surfaces a real (or planted-test) pattern.
- **Builds:** R-PAT-1, R-PAT-3, R-PAT-4, R-VIEW-2, R-VIEW-3

---

## Stage F — Native app (deferred)

### Phase 11 — SwiftUI app ☐
- **Goal:** Polished capture once the loop is proven.
- **Build:** Native app wrapping the same backend; rich confirmation cards, widgets/watch complication, offline+sync.
- **Tests:** Unit (view models); UI/integration tests against the backend.
- **You verify:** Day-to-day capture happens in the app instead of Shortcuts.
- **Builds:** R-CAP-6, R-NFR-6, [ADR-001](ARCHITECTURE.md#adr-001)

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-11 | Initial phased, gated roadmap created. |
| 2026-06-11 | Phase 0 implemented (Deno backend, ClaudeClient seam, tests, CI) → ◐ in progress, awaiting owner verification. |
