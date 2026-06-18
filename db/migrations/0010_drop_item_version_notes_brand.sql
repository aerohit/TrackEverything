-- Drop more unused input_item columns (ADR-035): `version`, `notes`, `brand`, and
-- the dependent `intake_event.item_version`. `version` was never incremented and its
-- only consumer (`item_version`, a per-event snapshot) was never read; `notes` was
-- write-once display-only with no edit path; `brand` was display-only metadata.
-- Idempotent — safe to re-run.

alter table intake_event drop column if exists item_version;
alter table input_item drop column if exists version;
alter table input_item drop column if exists notes;
alter table input_item drop column if exists brand;
