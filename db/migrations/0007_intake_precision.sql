-- Rough vs precise logging (v2-C4, ADR-032): flag how exact an intake is, so
-- analysis can weight estimates (photo/voice portions) below measured logs and the
-- UI can show them honestly. Additive; existing rows default to 'precise'.

create type intake_precision as enum ('precise', 'rough');

alter table intake_event add column precision intake_precision not null default 'precise';
