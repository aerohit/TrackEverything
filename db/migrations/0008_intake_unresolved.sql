-- Occasional / unresolved items (R-CAP-30): an intake logged by name with no
-- matching item and no known nutrition is flagged `unresolved` so the Overview can
-- offer to resolve it later. Additive; existing rows default to resolved (false).

alter table intake_event add column unresolved boolean not null default false;
