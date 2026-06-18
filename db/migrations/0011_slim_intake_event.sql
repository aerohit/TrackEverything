-- Slim down intake_event (ADR-036). Drop columns that were stored but never read
-- by the analytical pipeline or surfaced in the UI:
--   * canonical_quantity / canonical_unit — a per-event cache of the normalized
--     amount; daily totals sum resolved_amount (the frozen snapshot), never these.
--   * confidence — never displayed and never used in any calculation; `precision`
--     (precise/rough, shown as the "~" tag) is the live exactness signal we keep.
--   * notes — write-once, no UI to set or display it.
-- `source`, `precision`, `context_tags`, `unresolved` stay. The intake_confidence
-- enum is retained — resolved_amount.confidence still uses it. Idempotent.

alter table intake_event drop column if exists canonical_quantity;
alter table intake_event drop column if exists canonical_unit;
alter table intake_event drop column if exists confidence;
alter table intake_event drop column if exists notes;
